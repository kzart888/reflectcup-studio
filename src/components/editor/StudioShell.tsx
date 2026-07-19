"use client";

import { Check, ChevronDown, Clock3, Copy, Eye, Image as ImageIcon, LoaderCircle, Plus, Save, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CameraState, CropTransform, PreviewSession, RenderJob } from "@/lib/contracts";
import { DEFAULT_CAMERA, DEFAULT_CROP, MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { customerCopy as copy } from "@/i18n/customer";
import { ImageCropEditor } from "@/components/editor/ImageCropEditor";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import type { PreviewLoadState } from "@/rendering/ReflectiveCupPreview";
import styles from "@/components/editor/studio-shell.module.css";

type ApiError = { code: string; message: string; details?: unknown };
type Envelope<T> = { data: T } | { error: ApiError };
type RecentDesign = { id: string; updatedAt: string };
type CreatedSession = { session: PreviewSession; resumeUrl: string };
type CanonicalPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  key?: string;
};
type LocalEditorSnapshot = {
  generation: number;
  signature: string;
  crop: CropTransform;
  camera: CameraState;
  sceneId: string;
};

const RECENT_KEY = "reflectcup.recent-designs.v1";
let pendingSessionCreation: Promise<CreatedSession> | null = null;

function readRecent(): RecentDesign[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentDesign[];
    return parsed.filter((item) => item && typeof item.id === "string").slice(0, 8);
  } catch {
    return [];
  }
}

function rememberDesign(id: string): RecentDesign[] {
  const next = [{ id, updatedAt: new Date().toISOString() }, ...readRecent().filter((item) => item.id !== id)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const envelope = (await response.json().catch(() => ({ error: { code: "invalid_response", message: "Invalid response" } }))) as Envelope<T>;
  if (!response.ok || "error" in envelope) {
    const error = "error" in envelope ? envelope.error : { code: "request_failed", message: response.statusText };
    throw Object.assign(new Error(error.message), { status: response.status, code: error.code, details: error.details });
  }
  return envelope.data;
}

function createPreviewSession(): Promise<CreatedSession> {
  if (!pendingSessionCreation) {
    pendingSessionCreation = fetch("/api/v1/preview-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
      .then((response) => readEnvelope<CreatedSession>(response))
      .finally(() => window.setTimeout(() => { pendingSessionCreation = null; }, 1_000));
  }
  return pendingSessionCreation;
}

async function decodeImage(file: File): Promise<readonly [number, number]> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = [bitmap.width, bitmap.height] as const;
    bitmap.close();
    return size;
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve([image.naturalWidth, image.naturalHeight]);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode_failed"));
      };
      image.src = url;
    });
  }
}

async function transcodeImage(
  file: File,
  size: readonly [number, number],
  maxEdge: number,
  quality: number,
  outputType: "image/jpeg" | "image/webp",
): Promise<File> {
  const ratio = Math.min(1, maxEdge / Math.max(size[0], size[1]));
  const outputSize = [Math.max(1, Math.round(size[0] * ratio)), Math.max(1, Math.round(size[1] * ratio))] as const;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize[0];
  canvas.height = outputSize[1];
  const context = canvas.getContext("2d", { alpha: outputType !== "image/jpeg", colorSpace: "srgb" });
  if (!context) throw new Error("decode_failed");

  let bitmap: ImageBitmap | undefined;
  let objectUrl: string | undefined;
  try {
    try {
      bitmap = await createImageBitmap(file, {
        resizeWidth: outputSize[0],
        resizeHeight: outputSize[1],
        resizeQuality: "high",
      });
      context.drawImage(bitmap, 0, 0, outputSize[0], outputSize[1]);
    } catch {
      objectUrl = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("decode_failed"));
        element.src = objectUrl!;
      });
      context.drawImage(image, 0, 0, outputSize[0], outputSize[1]);
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("decode_failed")), outputType, quality);
    });
    const mimeType = blob.type === "image/webp"
      ? "image/webp"
      : blob.type === "image/png"
        ? "image/png"
        : "image/jpeg";
    const extension = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${extension}`, { type: mimeType });
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function prepareBrowserUpload(file: File): Promise<{
  file: File;
  previewFile: File;
  size: readonly [number, number];
}> {
  const size = await decodeImage(file);
  if (!size[0] || !size[1] || size[0] * size[1] > MAX_INPUT_PIXELS) throw new Error("image_too_large");

  const supported = new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type);
  const uploadFile = supported ? file : await transcodeImage(file, size, 4096, 0.94, "image/jpeg");
  const previewType = file.type === "image/png" || file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const previewFile = Math.max(size[0], size[1]) <= 1024 && supported
    ? file
    : await transcodeImage(file, size, 1024, 0.9, previewType);
  return { file: uploadFile, previewFile, size };
}

async function copyTextToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    field.style.pointerEvents = "none";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("clipboard_unavailable");
  }
}

function signature(crop: CropTransform, camera: CameraState, sceneId: string): string {
  return JSON.stringify({ crop, camera, sceneId });
}

function canonicalKey(sourceId: string, crop: CropTransform): string {
  return `${sourceId}:${crop.centerX}:${crop.centerY}:${crop.scale}`;
}

export function StudioShell({ requestedSessionId }: { requestedSessionId: string | "new" }) {
  const [session, setSession] = useState<PreviewSession | null>(null);
  const sessionRef = useRef<PreviewSession | null>(null);
  const [crop, setCrop] = useState<CropTransform>(DEFAULT_CROP);
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [sceneId, setSceneId] = useState("warm-craftsman-home");
  const [scenePending, startSceneTransition] = useTransition();
  const [sourceUrl, setSourceUrl] = useState<string>();
  const localSourceUrl = useRef<string | undefined>(undefined);
  const [sourceSize, setSourceSize] = useState<readonly [number, number]>([1, 1]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string>();
  const [imageError, setImageError] = useState<string>();
  const [uploadBusy, setUploadBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [mobileTab, setMobileTab] = useState<"adjust" | "preview">("adjust");
  const [recent, setRecent] = useState<RecentDesign[]>(() => typeof window === "undefined" ? [] : readRecent());
  const [recentOpen, setRecentOpen] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [resourceRetryNonce, setResourceRetryNonce] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewLoadState>({ status: "idle" });
  const [canonicalPreviewState, setCanonicalPreviewState] = useState<CanonicalPreviewState>({ status: "idle" });
  const [resumeCopied, setResumeCopied] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const lastSaved = useRef("");
  const lastRendered = useRef("");
  const canonicalPreviewRef = useRef<CanonicalPreviewState>({ status: "idle" });
  const saveAbort = useRef<AbortController | undefined>(undefined);
  const activeSave = useRef<Promise<PreviewSession | null> | null>(null);
  const saveAgain = useRef(false);
  const renderAbort = useRef<AbortController | undefined>(undefined);
  const editorSnapshot = useRef<LocalEditorSnapshot>({
    generation: 0,
    signature: signature(DEFAULT_CROP, DEFAULT_CAMERA, "warm-craftsman-home"),
    crop: DEFAULT_CROP,
    camera: DEFAULT_CAMERA,
    sceneId: "warm-craftsman-home",
  });

  const updateLocalCrop = useCallback((nextCrop: CropTransform) => {
    const current = editorSnapshot.current;
    const nextSignature = signature(nextCrop, current.camera, current.sceneId);
    if (nextSignature === current.signature) return;
    editorSnapshot.current = {
      ...current,
      crop: nextCrop,
      generation: current.generation + 1,
      signature: nextSignature,
    };
    setCrop(nextCrop);
  }, []);

  const updateLocalCamera = useCallback((nextCamera: CameraState) => {
    const current = editorSnapshot.current;
    const nextSignature = signature(current.crop, nextCamera, current.sceneId);
    if (nextSignature === current.signature) return;
    editorSnapshot.current = {
      ...current,
      camera: nextCamera,
      generation: current.generation + 1,
      signature: nextSignature,
    };
    setCamera(nextCamera);
  }, []);

  const updateLocalScene = useCallback((nextSceneId: string) => {
    const current = editorSnapshot.current;
    const nextSignature = signature(current.crop, current.camera, nextSceneId);
    if (nextSignature === current.signature) return;
    editorSnapshot.current = {
      ...current,
      sceneId: nextSceneId,
      generation: current.generation + 1,
      signature: nextSignature,
    };
    setSceneId(nextSceneId);
  }, []);

  const applySession = useCallback((next: PreviewSession) => {
    sessionRef.current = next;
    setSession(next);
    const nextSignature = signature(next.crop, next.camera, next.sceneId);
    editorSnapshot.current = {
      generation: editorSnapshot.current.generation + 1,
      signature: nextSignature,
      crop: next.crop,
      camera: next.camera,
      sceneId: next.sceneId,
    };
    setCrop(next.crop);
    setCamera(next.camera);
    setSceneId(next.sceneId);
    if (next.source) {
      setSourceUrl((current) => localSourceUrl.current ?? current ?? next.source!.url);
      setSourceSize([next.source.width ?? 1, next.source.height ?? 1]);
    }
    lastSaved.current = signature(next.crop, next.camera, next.sceneId);
    if (next.preview && next.source) {
      const key = canonicalKey(next.source.id, next.crop);
      lastRendered.current = key;
      const state = { status: "ready", key } as const;
      canonicalPreviewRef.current = state;
      setCanonicalPreviewState(state);
    } else {
      canonicalPreviewRef.current = { status: "idle" };
      setCanonicalPreviewState({ status: "idle" });
    }
    setSaveState("saved");
    setRecent(rememberDesign(next.id));
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const result = await readEnvelope<{ session: PreviewSession }>(await fetch(`/api/v1/preview-sessions/${id}`, { cache: "no-store" }));
    applySession(result.session);
  }, [applySession]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (requestedSessionId === "new") {
          const created = await createPreviewSession();
          if (!active) return;
          applySession(created.session);
          setLoading(false);
          const replaceCreatedUrl = () => window.history.replaceState(null, "", `/studio/${created.session.id}`);
          if (document.readyState === "complete") replaceCreatedUrl();
          else window.addEventListener("load", replaceCreatedUrl, { once: true });
        } else {
          const resumeToken = new URLSearchParams(window.location.hash.slice(1)).get("resume");
          if (resumeToken) {
            const exchanged = await readEnvelope<{ session: PreviewSession; resumeUrl: string }>(
              await fetch(`/api/v1/preview-sessions/${requestedSessionId}/access/exchange`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ resumeToken }),
              }),
            );
            history.replaceState(null, "", window.location.pathname + window.location.search);
            applySession(exchanged.session);
            return;
          }
          if (!active) return;
          await loadSession(requestedSessionId);
        }
      } catch {
        if (active) setFatalError(copy.sessionFailed);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [applySession, loadSession, requestedSessionId]);

  useEffect(() => () => {
    saveAbort.current?.abort();
    renderAbort.current?.abort();
    if (localSourceUrl.current) URL.revokeObjectURL(localSourceUrl.current);
  }, []);

  const requestCanonicalPreview = useCallback(async (next: PreviewSession, nextCrop: CropTransform): Promise<boolean> => {
    if (!next.source || next.status !== "draft") return false;
    const key = canonicalKey(next.source.id, nextCrop);
    if (lastRendered.current === key && canonicalPreviewRef.current.status === "ready" && canonicalPreviewRef.current.key === key) return true;
    renderAbort.current?.abort();
    const controller = new AbortController();
    renderAbort.current = controller;
    const loadingState = { status: "loading", key } as const;
    canonicalPreviewRef.current = loadingState;
    setCanonicalPreviewState(loadingState);
    try {
      const result = await readEnvelope<{ job: RenderJob }>(
        await fetch(`/api/v1/preview-sessions/${next.id}/renders`, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: next.revision }),
        }),
      );
      if (result.job.status !== "ready" || !result.job.output) throw new Error(result.job.error || "preview_render_failed");
      lastRendered.current = key;
      const readyState = { status: "ready", key } as const;
      canonicalPreviewRef.current = readyState;
      setCanonicalPreviewState(readyState);
      return true;
    } catch {
      if (controller.signal.aborted) return false;
      const failedState = { status: "error", key } as const;
      canonicalPreviewRef.current = failedState;
      setCanonicalPreviewState(failedState);
      return false;
    }
  }, []);

  const persistCurrent = useCallback((): Promise<PreviewSession | null> => {
    if (activeSave.current) {
      saveAgain.current = true;
      return activeSave.current;
    }

    const run = (async (): Promise<PreviewSession | null> => {
      do {
        saveAgain.current = false;
        const current = sessionRef.current;
        if (!current || current.status !== "draft") return current;

        const requestedEditor = editorSnapshot.current;
        if (requestedEditor.signature === lastSaved.current) {
          setSaveState("saved");
          return current;
        }

        const controller = new AbortController();
        saveAbort.current = controller;
        setSaveState("saving");
        try {
          const result = await readEnvelope<{ session: PreviewSession }>(
            await fetch(`/api/v1/preview-sessions/${current.id}`, {
              method: "PATCH",
              signal: controller.signal,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                revision: current.revision,
                crop: requestedEditor.crop,
                camera: requestedEditor.camera,
                sceneId: requestedEditor.sceneId,
              }),
            }),
          );
          sessionRef.current = result.session;
          setSession(result.session);
          const responseSignature = signature(result.session.crop, result.session.camera, result.session.sceneId);
          lastSaved.current = responseSignature;
          setRecent(rememberDesign(result.session.id));

          const responseStillMatchesEditor = editorSnapshot.current.generation === requestedEditor.generation
            && editorSnapshot.current.signature === requestedEditor.signature;
          if (responseStillMatchesEditor) {
            editorSnapshot.current = {
              generation: requestedEditor.generation,
              signature: responseSignature,
              crop: result.session.crop,
              camera: result.session.camera,
              sceneId: result.session.sceneId,
            };
            setCrop(result.session.crop);
            setCamera(result.session.camera);
            setSceneId(result.session.sceneId);
            await requestCanonicalPreview(result.session, result.session.crop);
          }

          const editorStillMatchesResponse = editorSnapshot.current.generation === requestedEditor.generation
            && editorSnapshot.current.signature === responseSignature;
          if (editorStillMatchesResponse) {
            setSaveState("saved");
          } else {
            saveAgain.current = true;
            setSaveState("unsaved");
          }
        } catch (error) {
          if (controller.signal.aborted) return sessionRef.current;
          if ((error as { status?: number }).status === 409) {
            setConflict(true);
            setSaveState("unsaved");
          } else {
            setSaveState("error");
          }
          throw error;
        }
      } while (saveAgain.current);

      return sessionRef.current;
    })();

    activeSave.current = run;
    const clearActive = () => {
      if (activeSave.current === run) activeSave.current = null;
    };
    void run.then(clearActive, clearActive);
    return run;
  }, [requestCanonicalPreview]);

  useEffect(() => {
    if (!session || session.status !== "draft") return;
    const currentSignature = signature(crop, camera, sceneId);
    if (currentSignature === lastSaved.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => void persistCurrent().catch(() => undefined), 650);
    return () => window.clearTimeout(timer);
  }, [camera, crop, persistCurrent, sceneId, session]);

  useEffect(() => {
    if (!session?.source || session.status !== "draft" || canonicalPreviewState.status !== "idle") return;
    if (lastSaved.current !== signature(session.crop, session.camera, session.sceneId)) return;
    const timer = window.setTimeout(() => void requestCanonicalPreview(session, session.crop), 0);
    return () => window.clearTimeout(timer);
  }, [canonicalPreviewState.status, requestCanonicalPreview, session]);

  const handleFile = async (file: File) => {
    const current = sessionRef.current;
    if (!current) return;
    setImageError(undefined);
    if (file.size > MAX_UPLOAD_BYTES) {
      setImageError(copy.imageTooLarge);
      return;
    }
    saveAbort.current?.abort();
    lastSaved.current = signature(crop, camera, sceneId);
    setUploadBusy(true);
    const previousLocal = localSourceUrl.current;
    let nextLocal: string | undefined;
    try {
      const prepared = await prepareBrowserUpload(file);
      const dimensions = prepared.size;
      if (prepared.file.size > MAX_UPLOAD_BYTES) {
        throw new Error("image_too_large");
      }
      nextLocal = URL.createObjectURL(prepared.previewFile);
      localSourceUrl.current = nextLocal;
      setSourceUrl(nextLocal);
      setSourceSize(dimensions);
      updateLocalCrop(DEFAULT_CROP);
      setPreviewState({ status: "loading" });
      canonicalPreviewRef.current = { status: "idle" };
      setCanonicalPreviewState({ status: "idle" });
      setMobileTab("preview");
      const form = new FormData();
      form.append("file", prepared.file);
      const result = await readEnvelope<{ session: PreviewSession; asset: PreviewSession["source"] }>(
        await fetch(`/api/v1/preview-sessions/${current.id}/source`, { method: "POST", body: form }),
      );
      sessionRef.current = result.session;
      setSession(result.session);
      setSourceSize([result.session.source?.width ?? dimensions[0], result.session.source?.height ?? dimensions[1]]);
      lastSaved.current = "";
      lastRendered.current = "";
      setSaveState("unsaved");
      if (previousLocal) URL.revokeObjectURL(previousLocal);
    } catch (error) {
      if (nextLocal) URL.revokeObjectURL(nextLocal);
      localSourceUrl.current = previousLocal;
      setSourceUrl(previousLocal ?? current.source?.url);
      setSourceSize([current.source?.width ?? 1, current.source?.height ?? 1]);
      setPreviewState({ status: current.source ? "loading" : "idle" });
      setImageError((error as Error).message === "image_too_large" ? copy.imageTooLarge : copy.invalidImage);
    } finally {
      setUploadBusy(false);
    }
  };

  const desiredCanonicalKey = session?.source ? canonicalKey(session.source.id, crop) : undefined;
  const currentCanonicalState: CanonicalPreviewState["status"] = !desiredCanonicalKey
    ? "idle"
    : canonicalPreviewState.key === desiredCanonicalKey
      ? canonicalPreviewState.status
      : "loading";
  const previewReady = previewState.status === "ready" && currentCanonicalState === "ready";

  const handleSceneChange = useCallback((nextSceneId: string) => {
    startSceneTransition(() => updateLocalScene(nextSceneId));
  }, [updateLocalScene]);

  const handlePreviewRetry = async () => {
    const current = sessionRef.current;
    if (!current?.source || current.status !== "draft") return;
    if (previewState.status === "error") {
      setResourceRetryNonce((value) => value + 1);
      setPreviewState({ status: "loading" });
    }
    const persisted = await persistCurrent().catch(() => undefined);
    const latest = persisted ?? sessionRef.current;
    if (latest?.source && latest.status === "draft") await requestCanonicalPreview(latest, latest.crop);
  };

  const handleConfirm = async () => {
    const current = sessionRef.current;
    if (!current?.source || confirming || conflict || !previewReady) return;
    setConfirming(true);
    try {
      const persisted = await persistCurrent();
      if (!persisted) return;
      const canonicalReady = await requestCanonicalPreview(persisted, persisted.crop);
      if (!canonicalReady || previewState.status !== "ready") return;
      const result = await readEnvelope<{ session: PreviewSession; snapshot: unknown }>(
        await fetch(`/api/v1/preview-sessions/${persisted.id}/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: persisted.revision }),
        }),
      );
      applySession(result.session);
    } catch {
      setSaveState("error");
    } finally {
      setConfirming(false);
    }
  };

  const handleLoadLatest = async () => {
    if (!sessionRef.current) return;
    setConflict(false);
    setLoading(true);
    try { await loadSession(sessionRef.current.id); } finally { setLoading(false); }
  };

  const handleSaveAsNew = async () => {
    const current = sessionRef.current;
    if (!current) return;
    setConflict(false);
    setLoading(true);
    try {
      const created = await readEnvelope<{ session: PreviewSession; resumeUrl: string }>(
        await fetch("/api/v1/preview-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      );
      let duplicate = created.session;
      const currentSourceUrl = sourceUrl ?? current.source?.url;
      if (currentSourceUrl) {
        const blob = await (await fetch(currentSourceUrl)).blob();
        const form = new FormData();
        form.append("file", new File([blob], "design-copy.webp", { type: blob.type || "image/webp" }));
        const uploaded = await readEnvelope<{ session: PreviewSession }>(
          await fetch(`/api/v1/preview-sessions/${duplicate.id}/source`, { method: "POST", body: form }),
        );
        duplicate = uploaded.session;
      }
      const patched = await readEnvelope<{ session: PreviewSession }>(
        await fetch(`/api/v1/preview-sessions/${duplicate.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision: duplicate.revision, crop, camera, sceneId }),
        }),
      );
      await requestCanonicalPreview(patched.session, crop);
      window.location.assign(`/studio/${patched.session.id}`);
    } catch {
      setSaveState("error");
      setLoading(false);
    }
  };

  const handleCopyResumeLink = async () => {
    if (!sessionRef.current || resumeBusy) return;
    setResumeBusy(true);
    setResumeCopied(false);
    try {
      const rotated = await readEnvelope<{ resumeUrl: string }>(
        await fetch(`/api/v1/preview-sessions/${sessionRef.current.id}/access/rotate`, { method: "POST" }),
      );
      const absoluteUrl = new URL(rotated.resumeUrl, window.location.origin).toString();
      await copyTextToClipboard(absoluteUrl);
      setResumeCopied(true);
    } catch {
      setSaveState("error");
    } finally {
      setResumeBusy(false);
    }
  };

  const saveLabel = useMemo(() => {
    if (saveState === "saving") return copy.saving;
    if (saveState === "unsaved") return copy.unsaved;
    if (saveState === "error") return copy.offline;
    return copy.saved;
  }, [saveState]);

  if (loading) return <main className={styles.statePage}><LoaderCircle className={styles.spin} /> <p>{copy.loading}</p></main>;
  if (fatalError || !session) return (
    <main className={styles.statePage}>
      <TriangleAlert />
      <h1>{fatalError ?? copy.sessionFailed}</h1>
      <button type="button" onClick={() => window.location.reload()}>{copy.retry}</button>
    </main>
  );

  const locked = session.status !== "draft";
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="ReflectCup Studio home">
          <span className={styles.brandGlyph} aria-hidden="true">R</span>
          <span><strong>{copy.brand}</strong><small>{copy.digitalPrototype}</small></span>
        </Link>
        <div className={styles.sessionActions}>
          <span className={`${styles.saveStatus} ${styles[saveState]}`} aria-live="polite">
            {saveState === "saving" ? <LoaderCircle className={styles.spin} size={14} /> : saveState === "saved" ? <Check size={14} /> : <Save size={14} />}
            {saveLabel}
          </span>
          <button type="button" className={styles.headerButton} onClick={() => window.location.assign("/studio/new")}>
            <Plus size={16} /> <span>{copy.newDesign}</span>
          </button>
          <button
            type="button"
            className={styles.headerButton}
            aria-label={resumeCopied ? copy.resumeCopied : copy.copyResume}
            disabled={resumeBusy}
            onClick={() => void handleCopyResumeLink()}
          >
            {resumeBusy ? <LoaderCircle className={styles.spin} size={16} /> : resumeCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>{resumeBusy ? copy.preparingResume : resumeCopied ? copy.resumeCopied : copy.copyResume}</span>
          </button>
          <div className={styles.recentWrap}>
            <button type="button" className={styles.headerButton} aria-expanded={recentOpen} onClick={() => setRecentOpen((open) => !open)}>
              <Clock3 size={16} /> <span>{copy.recentDesigns}</span> <ChevronDown size={14} />
            </button>
            {recentOpen ? (
              <div className={styles.recentMenu}>
                {recent.length ? recent.map((item) => (
                  <Link key={item.id} href={`/studio/${item.id}`}>
                    <span>{item.id.slice(0, 8)}</span>
                    <small>{new Date(item.updatedAt).toLocaleDateString()}</small>
                  </Link>
                )) : <p>{copy.emptyRecent}</p>}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav className={styles.mobileTabs} aria-label="Studio view">
        <button className={mobileTab === "adjust" ? styles.activeTab : ""} type="button" onClick={() => setMobileTab("adjust")}><ImageIcon size={16} /> {copy.adjustTab}</button>
        <button className={mobileTab === "preview" ? styles.activeTab : ""} type="button" onClick={() => setMobileTab("preview")}><Eye size={16} /> {copy.previewTab}</button>
      </nav>

      {locked ? <div className={styles.lockedNotice}><Check size={17} /> {copy.confirmedNotice}</div> : null}
      <div className={styles.workspace}>
        <div className={`${styles.editorPane} ${mobileTab !== "adjust" ? styles.mobileHidden : ""}`}>
          <ImageCropEditor
            sourceUrl={sourceUrl ?? session.source?.url}
            sourceSize={sourceSize}
            crop={crop}
            maskUrl={session.opticalRuntime.targetMask.url}
            contourUrl={session.opticalRuntime.targetContour?.url}
            disabled={locked}
            uploadBusy={uploadBusy}
            error={imageError}
            onCropChange={updateLocalCrop}
            onFileSelected={handleFile}
            onReset={() => updateLocalCrop(DEFAULT_CROP)}
          />
        </div>
        <div className={`${styles.previewPane} ${mobileTab !== "preview" ? styles.mobileHidden : ""}`}>
          <PreviewPanel
            sourceUrl={sourceUrl ?? session.source?.url}
            sourceSize={sourceSize}
            crop={crop}
            camera={camera}
            opticalRuntime={session.opticalRuntime}
            previewSettings={session.previewSettings}
            resetNonce={resetNonce}
            resourceRetryNonce={resourceRetryNonce}
            previewState={previewState}
            canonicalState={currentCanonicalState}
            sceneId={sceneId}
            sceneVersion={sceneId === session.sceneId ? session.sceneVersion : undefined}
            sceneChecksum={sceneId === session.sceneId ? session.sceneChecksum : undefined}
            sceneDisabled={locked || scenePending}
            onBestView={() => setResetNonce((value) => value + 1)}
            onSceneChange={handleSceneChange}
            onRetry={() => void handlePreviewRetry()}
            onPreviewStateChange={setPreviewState}
            onCameraChange={(position) => {
              const rounded = position.map((value) => Math.round(value * 10_000) / 10_000) as [number, number, number];
              if (!editorSnapshot.current.camera.position.every((value, index) => value === rounded[index])) {
                updateLocalCamera({ position: rounded, target: session.opticalRuntime.profile.designCamera.target });
              }
            }}
          />
        </div>
      </div>

      {conflict ? (
        <section className={styles.conflict} role="alertdialog" aria-labelledby="conflict-title">
          <TriangleAlert size={21} />
          <div><strong id="conflict-title">{copy.conflictTitle}</strong><p>{copy.conflictBody}</p></div>
          <button type="button" onClick={handleLoadLatest}>{copy.loadLatest}</button>
          <button type="button" onClick={handleSaveAsNew}>{copy.saveAsNew}</button>
        </section>
      ) : null}

      <footer className={styles.confirmBar}>
        <div><span>Session {session.id.slice(0, 8)}</span><small>{session.opticalProfile.label} · physical calibration pending</small></div>
        <button type="button" onClick={() => void handleConfirm()} disabled={!session.source || locked || confirming || uploadBusy || conflict || !previewReady}>
          {confirming ? <LoaderCircle className={styles.spin} size={18} /> : locked ? <Check size={18} /> : <Check size={18} />}
          {locked ? copy.confirmed : confirming ? copy.confirming : copy.confirm}
        </button>
      </footer>
    </main>
  );
}

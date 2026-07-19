"use client";

import { Focus, Layers3, LoaderCircle, MousePointer2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CameraState, CropTransform, OpticalRuntime, PreviewRuntimeSettings } from "@/lib/contracts";
import { customerCopy as copy } from "@/i18n/customer";
import { ReflectiveCupPreview, type PreviewLoadState } from "@/rendering/ReflectiveCupPreview";
import { CUSTOMER_SCENES, preloadSceneAssets, sceneReferenceKey } from "@/scenes/catalog";
import { browserSceneRuntimeHints, initialSceneQuality } from "@/scenes/runtime-policy";
import styles from "@/components/preview/preview-panel.module.css";

type Props = {
  sourceUrl?: string;
  sourceSize: readonly [number, number];
  crop: CropTransform;
  camera: CameraState;
  opticalRuntime: OpticalRuntime;
  previewSettings: PreviewRuntimeSettings;
  resetNonce: number;
  resourceRetryNonce: number;
  previewState: PreviewLoadState;
  canonicalState: "idle" | "loading" | "ready" | "error";
  sceneId: string;
  sceneVersion?: number;
  sceneChecksum?: string;
  sceneDisabled?: boolean;
  onBestView: () => void;
  onSceneChange: (sceneId: string) => void | Promise<void>;
  onRetry: () => void;
  onCameraChange: (position: readonly [number, number, number]) => void;
  onPreviewStateChange: (state: PreviewLoadState) => void;
};

export function PreviewPanel({ sourceUrl, sourceSize, crop, camera, opticalRuntime, previewSettings, resetNonce, resourceRetryNonce, previewState, canonicalState, sceneId, sceneVersion, sceneChecksum, sceneDisabled = false, onBestView, onSceneChange, onRetry, onCameraChange, onPreviewStateChange }: Props) {
  const sceneLoad = useRef<AbortController | undefined>(undefined);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [failedSceneId, setFailedSceneId] = useState<string>();
  useEffect(() => () => sceneLoad.current?.abort(), []);
  const changeScene = async (nextSceneId: string) => {
    if (nextSceneId === sceneId && !failedSceneId) return;
    sceneLoad.current?.abort();
    const controller = new AbortController();
    sceneLoad.current = controller;
    setSceneBusy(true);
    setFailedSceneId(undefined);
    try {
      const preloadQuality = initialSceneQuality(browserSceneRuntimeHints());
      await preloadSceneAssets(nextSceneId, controller.signal, preloadQuality);
      if (!controller.signal.aborted) await onSceneChange(nextSceneId);
    } catch {
      if (!controller.signal.aborted) setFailedSceneId(nextSceneId);
    } finally {
      if (!controller.signal.aborted) setSceneBusy(false);
    }
  };
  let renderSceneId = sceneId;
  let sceneReplayUnavailable = false;
  try {
    if ((sceneVersion === undefined) !== (sceneChecksum === undefined)) {
      throw new Error("Incomplete scene release reference");
    }
    if (sceneVersion !== undefined && sceneChecksum !== undefined) {
      renderSceneId = sceneReferenceKey({ sceneId, sceneVersion, sceneChecksum });
    }
  } catch {
    sceneReplayUnavailable = true;
  }
  const failed = sceneReplayUnavailable || previewState.status === "error" || canonicalState === "error";
  const loading = Boolean(sourceUrl) && !failed && (previewState.status !== "ready" || canonicalState === "loading");
  return (
    <section className={styles.panel} aria-label={copy.accessibilityPreview}>
      <div className={styles.heading}>
        <div><p>02 · Preview</p><h2>{copy.previewTitle}</h2></div>
        <div className={styles.headingActions}>
          <label className={styles.sceneSelect}>
            {sceneBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Layers3 size={16} />}
            <span className={styles.srOnly}>{copy.sceneLabel}</span>
            <select
              aria-label={copy.sceneLabel}
              value={sceneId}
              disabled={sceneDisabled}
              onChange={(event) => void changeScene(event.target.value)}
            >
              {CUSTOMER_SCENES.map((scene) => <option key={scene.id} value={scene.id}>{scene.shortLabel}</option>)}
            </select>
          </label>
          <button type="button" onClick={onBestView}><Focus size={17} /> {copy.bestView}</button>
        </div>
      </div>
      {failedSceneId ? (
        <div className={styles.sceneError} role="alert">
          <span>{copy.sceneLoadFailed}</span>
          <button type="button" onClick={() => void changeScene(failedSceneId)}>
            <RefreshCw size={14} /> {copy.retryScene}
          </button>
        </div>
      ) : null}
      <div className={styles.stage}>
        {sceneReplayUnavailable ? (
          <div className={styles.error} role="alert">
            <TriangleAlert size={21} />
            <p>{copy.sceneReplayUnavailable}</p>
          </div>
        ) : (
          <ReflectiveCupPreview
            className={styles.canvas}
            sourceUrl={sourceUrl}
            sourceSize={sourceSize}
            crop={crop}
            cameraState={camera}
            opticalRuntime={opticalRuntime}
            previewSettings={previewSettings}
            sceneId={renderSceneId}
            resetNonce={resetNonce}
            resourceRetryNonce={resourceRetryNonce}
            onCameraChange={onCameraChange}
            onPreviewStateChange={onPreviewStateChange}
          />
        )}
        {!sceneReplayUnavailable && !sourceUrl ? <div className={styles.empty}><MousePointer2 size={22} /><p>Upload an image to reveal it in the cup.</p></div> : null}
        {!sceneReplayUnavailable && sourceUrl && previewState.status === "loading" ? <div className={styles.loading} role="status"><LoaderCircle size={18} /> Loading the optical preview…</div> : null}
        {!sceneReplayUnavailable && previewState.status === "error" ? (
          <div className={styles.error} role="alert">
            <TriangleAlert size={21} />
            <p>{previewState.error === "source" ? copy.sourcePreviewFailed : previewState.error === "webgl" ? copy.webglPreviewFailed : copy.opticalPreviewFailed}</p>
            <button type="button" onClick={onRetry}><RefreshCw size={15} /> {copy.retryPreview}</button>
          </div>
        ) : null}
        {!sceneReplayUnavailable ? <span className={styles.badge}>Physically simulated</span> : null}
      </div>
      {sceneReplayUnavailable ? null : canonicalState === "error" && previewState.status !== "error" ? (
        <div className={styles.canonicalError} role="alert">
          <TriangleAlert size={16} />
          <span>{copy.canonicalPreviewFailed}</span>
          <button type="button" onClick={onRetry}><RefreshCw size={14} /> {copy.retryPreview}</button>
        </div>
      ) : previewState.status !== "error" ? (
        <p className={styles.hint}>{loading ? copy.preparingPreview : canonicalState === "ready" ? copy.previewReady : copy.previewHint}</p>
      ) : null}
    </section>
  );
}

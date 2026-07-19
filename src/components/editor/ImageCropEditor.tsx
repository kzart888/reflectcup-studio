"use client";

import { ImagePlus, RefreshCcw, Replace, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CropTransform } from "@/lib/contracts";
import type { TargetContourDocument, Vec2 } from "@/optics";
import { customerCopy as copy } from "@/i18n/customer";
import styles from "@/components/editor/image-crop-editor.module.css";

type Props = {
  sourceUrl?: string;
  sourceSize?: readonly [number, number];
  crop: CropTransform;
  maskUrl: string;
  contourUrl?: string;
  disabled?: boolean;
  uploadBusy?: boolean;
  error?: string;
  onCropChange: (crop: CropTransform) => void;
  onFileSelected: (file: File) => void;
  onReset: () => void;
};

type PointerPoint = { x: number; y: number };

function baseSpan(sourceSize: readonly [number, number]): readonly [number, number] {
  const aspect = sourceSize[0] / Math.max(sourceSize[1], 1);
  return aspect >= 1 ? [1 / aspect, 1] : [1, aspect];
}

function clampCrop(crop: CropTransform, sourceSize: readonly [number, number]): CropTransform {
  const scale = Math.min(8, Math.max(1, crop.scale));
  const span = baseSpan(sourceSize);
  const halfX = span[0] / scale / 2;
  const halfY = span[1] / scale / 2;
  return {
    centerX: Math.min(1 - halfX, Math.max(halfX, crop.centerX)),
    centerY: Math.min(1 - halfY, Math.max(halfY, crop.centerY)),
    scale,
  };
}

async function createMaskOverlay(maskUrl: string): Promise<string> {
  const maskImage = new Image();
  maskImage.src = maskUrl;
  await maskImage.decode();
  const size = maskImage.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = maskImage.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";
  context.drawImage(maskImage, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const original = pixels.data.slice();
  const isValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
    return original[(y * canvas.width + x) * 4] > 127;
  };
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixel = (y * canvas.width + x) * 4;
      const valid = isValid(x, y);
      const edge = valid && (!isValid(x - 1, y) || !isValid(x + 1, y) || !isValid(x, y - 1) || !isValid(x, y + 1));
      pixels.data[pixel] = edge ? 214 : 12;
      pixels.data[pixel + 1] = edge ? 238 : 18;
      pixels.data[pixel + 2] = edge ? 225 : 16;
      pixels.data[pixel + 3] = edge ? 235 : valid ? 0 : 145;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function midpoint(first: Vec2, second: Vec2): Vec2 {
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
}

function smoothClosedPath(points: readonly Vec2[]): string {
  if (points.length < 3) return "";
  const start = midpoint(points.at(-1)!, points[0]);
  const commands = [`M ${start[0]} ${start[1]}`];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const nextMidpoint = midpoint(current, next);
    commands.push(`Q ${current[0]} ${current[1]} ${nextMidpoint[0]} ${nextMidpoint[1]}`);
  }
  commands.push("Z");
  return commands.join(" ");
}

function contourDocumentPath(document: TargetContourDocument): string {
  if (document.schemaVersion !== 1 || document.coordinateSpace !== "target-uv") return "";
  return document.paths.map((path) => smoothClosedPath(path.points)).filter(Boolean).join(" ");
}

export function ImageCropEditor({
  sourceUrl,
  sourceSize = [1, 1],
  crop,
  maskUrl,
  contourUrl,
  disabled = false,
  uploadBusy = false,
  error,
  onCropChange,
  onFileSelected,
  onReset,
}: Props) {
  const interactionsDisabled = disabled || uploadBusy;
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerPoint>());
  const singleLast = useRef<PointerPoint | null>(null);
  const pinch = useRef<{
    distance: number;
    centroid: PointerPoint;
    crop: CropTransform;
  } | null>(null);
  const [maskOverlayUrl, setMaskOverlayUrl] = useState("");
  const [contourPath, setContourPath] = useState("");
  useEffect(() => {
    let active = true;
    const loadOverlay = async () => {
      if (contourUrl) {
        try {
          const response = await fetch(contourUrl, { cache: "force-cache" });
          if (!response.ok) throw new Error("Target contour failed to load");
          const path = contourDocumentPath(await response.json() as TargetContourDocument);
          if (!path) throw new Error("Target contour is empty");
          if (active) {
            setContourPath(path);
            setMaskOverlayUrl("");
          }
          return;
        } catch {
          // Older immutable profiles do not carry a contour resource. Keep
          // their raster mask available as a compatibility fallback.
        }
      }
      try {
        const url = await createMaskOverlay(maskUrl);
        if (active) {
          setContourPath("");
          setMaskOverlayUrl(url);
        }
      } catch {
        if (active) {
          setContourPath("");
          setMaskOverlayUrl("");
        }
      }
    };
    void loadOverlay();
    return () => { active = false; };
  }, [contourUrl, maskUrl]);

  const imageStyle = useMemo(() => {
    const aspect = sourceSize[0] / Math.max(sourceSize[1], 1);
    const width = (aspect >= 1 ? aspect : 1) * crop.scale * 100;
    const height = (aspect >= 1 ? 1 : 1 / aspect) * crop.scale * 100;
    return {
      width: `${width}%`,
      height: `${height}%`,
      left: `${50 - crop.centerX * width}%`,
      top: `${50 - crop.centerY * height}%`,
    };
  }, [crop, sourceSize]);

  const applyPan = (deltaX: number, deltaY: number, origin = crop) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const span = baseSpan(sourceSize);
    onCropChange(
      clampCrop(
        {
          ...origin,
          centerX: origin.centerX - (deltaX / viewport.clientWidth) * (span[0] / origin.scale),
          centerY: origin.centerY - (deltaY / viewport.clientHeight) * (span[1] / origin.scale),
        },
        sourceSize,
      ),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!sourceUrl || interactionsDisabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) singleLast.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [first, second] = Array.from(pointers.current.values());
      pinch.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        centroid: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        crop,
      };
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || interactionsDisabled) return;
    const previous = pointers.current.get(event.pointerId)!;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 1) {
      const last = singleLast.current ?? previous;
      applyPan(next.x - last.x, next.y - last.y);
      singleLast.current = next;
      return;
    }
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = Array.from(pointers.current.values());
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const centroid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const nextScale = Math.min(8, Math.max(1, pinch.current.crop.scale * (distance / pinch.current.distance)));
      const scaled = clampCrop({ ...pinch.current.crop, scale: nextScale }, sourceSize);
      applyPan(centroid.x - pinch.current.centroid.x, centroid.y - pinch.current.centroid.y, scaled);
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    const remaining = Array.from(pointers.current.values())[0];
    singleLast.current = remaining ?? null;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!sourceUrl || interactionsDisabled) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    const span = baseSpan(sourceSize);
    const anchoredSourceX = crop.centerX + (pointerX - 0.5) * span[0] / crop.scale;
    const anchoredSourceY = crop.centerY + (pointerY - 0.5) * span[1] / crop.scale;
    const nextScale = Math.min(8, Math.max(1, crop.scale * Math.exp(-event.deltaY * 0.0015)));
    onCropChange(
      clampCrop(
        {
          scale: nextScale,
          centerX: anchoredSourceX - (pointerX - 0.5) * span[0] / nextScale,
          centerY: anchoredSourceY - (pointerY - 0.5) * span[1] / nextScale,
        },
        sourceSize,
      ),
    );
  };

  return (
    <section className={styles.editor} aria-label={copy.accessibilityEditor}>
      <div className={styles.heading}>
        <div>
          <p className={styles.step}>01 · Image</p>
          <h1>{sourceUrl ? "Position your image" : copy.uploadTitle}</h1>
        </div>
        {sourceUrl ? (
          <button className={styles.iconButton} type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploadBusy}>
            <Replace size={17} aria-hidden="true" />
            {copy.replaceAction}
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          event.target.value = "";
        }}
      />

      {sourceUrl ? (
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-testid="crop-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.sourceImage} src={sourceUrl} alt="Uploaded source" draggable={false} style={imageStyle} />
          {contourPath ? (
            <svg className={styles.maskVector} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <path className={styles.maskDim} d={`M 0 0 H 1 V 1 H 0 Z ${contourPath}`} fillRule="evenodd" />
              <path className={styles.maskBoundaryBase} d={contourPath} fill="none" vectorEffect="non-scaling-stroke" />
              <path className={styles.maskBoundary} d={contourPath} fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          ) : maskOverlayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.mask} src={maskOverlayUrl} alt="" aria-hidden="true" draggable={false} />
          ) : null}
          <span className={styles.areaLabel}>Reflection area</span>
        </div>
      ) : (
        <button className={styles.dropzone} type="button" onClick={() => inputRef.current?.click()} disabled={uploadBusy}>
          <span className={styles.uploadIcon}><ImagePlus size={25} aria-hidden="true" /></span>
          <strong>{uploadBusy ? "Opening image…" : copy.uploadAction}</strong>
          <small>{copy.uploadHint}</small>
        </button>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {sourceUrl ? (
        <div className={styles.controls}>
          <label className={styles.sliderRow}>
            <span><ZoomIn size={16} aria-hidden="true" /> {copy.zoomLabel}</span>
            <input
              aria-label={copy.zoomLabel}
              type="range"
              min="1"
              max="8"
              step="0.01"
              value={crop.scale}
              disabled={interactionsDisabled}
              onChange={(event) => onCropChange(clampCrop({ ...crop, scale: Number(event.target.value) }, sourceSize))}
            />
            <output>{crop.scale.toFixed(1)}×</output>
          </label>
          <button className={styles.resetButton} type="button" onClick={onReset} disabled={interactionsDisabled}>
            <RefreshCcw size={15} aria-hidden="true" /> {copy.resetAction}
          </button>
        </div>
      ) : null}

      <div className={styles.hints}>
        <p>{copy.mappingHint}</p>
        {sourceUrl ? <p>{copy.dragHint}</p> : null}
      </div>
    </section>
  );
}

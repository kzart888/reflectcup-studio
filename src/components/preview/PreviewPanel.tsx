"use client";

import { Focus, LoaderCircle, MousePointer2, RefreshCw, TriangleAlert } from "lucide-react";
import type { CameraState, CropTransform, OpticalRuntime, PreviewRuntimeSettings } from "@/lib/contracts";
import { customerCopy as copy } from "@/i18n/customer";
import { ReflectiveCupPreview, type PreviewLoadState } from "@/rendering/ReflectiveCupPreview";
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
  onBestView: () => void;
  onRetry: () => void;
  onCameraChange: (position: readonly [number, number, number]) => void;
  onPreviewStateChange: (state: PreviewLoadState) => void;
};

export function PreviewPanel({ sourceUrl, sourceSize, crop, camera, opticalRuntime, previewSettings, resetNonce, resourceRetryNonce, previewState, canonicalState, onBestView, onRetry, onCameraChange, onPreviewStateChange }: Props) {
  const failed = previewState.status === "error" || canonicalState === "error";
  const loading = Boolean(sourceUrl) && !failed && (previewState.status !== "ready" || canonicalState === "loading");
  return (
    <section className={styles.panel} aria-label={copy.accessibilityPreview}>
      <div className={styles.heading}>
        <div><p>02 · Preview</p><h2>{copy.previewTitle}</h2></div>
        <button type="button" onClick={onBestView}><Focus size={17} /> {copy.bestView}</button>
      </div>
      <div className={styles.stage}>
        <ReflectiveCupPreview
          className={styles.canvas}
          sourceUrl={sourceUrl}
          sourceSize={sourceSize}
          crop={crop}
          cameraState={camera}
          opticalRuntime={opticalRuntime}
          previewSettings={previewSettings}
          resetNonce={resetNonce}
          resourceRetryNonce={resourceRetryNonce}
          onCameraChange={onCameraChange}
          onPreviewStateChange={onPreviewStateChange}
        />
        {!sourceUrl ? <div className={styles.empty}><MousePointer2 size={22} /><p>Upload an image to reveal it in the cup.</p></div> : null}
        {sourceUrl && previewState.status === "loading" ? <div className={styles.loading} role="status"><LoaderCircle size={18} /> Loading the optical preview…</div> : null}
        {previewState.status === "error" ? (
          <div className={styles.error} role="alert">
            <TriangleAlert size={21} />
            <p>{previewState.error === "source" ? copy.sourcePreviewFailed : previewState.error === "webgl" ? copy.webglPreviewFailed : copy.opticalPreviewFailed}</p>
            <button type="button" onClick={onRetry}><RefreshCw size={15} /> {copy.retryPreview}</button>
          </div>
        ) : null}
        <span className={styles.badge}>Physically simulated</span>
      </div>
      {canonicalState === "error" && previewState.status !== "error" ? (
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

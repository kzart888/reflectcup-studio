export type Vec3Tuple = readonly [number, number, number];
export type Matrix4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export type CropTransform = {
  centerX: number;
  centerY: number;
  scale: number;
};

export type CameraState = {
  position: Vec3Tuple;
  target: Vec3Tuple;
};

export type AssetRef = {
  id: string;
  kind: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  sha256?: string;
};

export type OpticalProfileSummary = {
  id: string;
  slug: string;
  label: string;
  version: number;
  status: "draft" | "published" | "retired";
};

export type OpticalRuntimeAssetRef = {
  url: string;
  mimeType: "application/octet-stream" | "image/png";
  width: number;
  height: number;
  byteSize?: number;
  sha256?: string;
  encoding: "rg32f-le" | "r8" | "png-r8";
};

export type OpticalRuntime = {
  schemaVersion: 1;
  checksum: string;
  profile: import("@/optics/types").OpticalProfile;
  lut: OpticalRuntimeAssetRef;
  mask: OpticalRuntimeAssetRef;
  targetMask: OpticalRuntimeAssetRef;
};

export type PreviewRuntimeSettings = {
  toneMappingExposure: number;
  mobileDprCap: number;
  desktopDprCap: number;
  keyLightMultiplier: number;
};

export type PreviewSessionStatus =
  | "draft"
  | "confirmed"
  | "checkout_pending"
  | "paid"
  | "production_ready"
  | "completed"
  | "expired";

export type PreviewSession = {
  id: string;
  status: PreviewSessionStatus;
  revision: number;
  opticalProfile: OpticalProfileSummary;
  opticalRuntime: OpticalRuntime;
  previewSettings: PreviewRuntimeSettings;
  sceneId: string;
  crop: CropTransform;
  camera: CameraState;
  source?: AssetRef;
  preview?: AssetRef;
  styleStrategy: "identity";
  fillStrategy: "none";
  createdAt: string;
  updatedAt: string;
};

export type RenderJobStatus = "queued" | "running" | "ready" | "failed";

export type RenderJob = {
  id: string;
  sessionId: string;
  kind: "preview" | "production_bundle";
  status: RenderJobStatus;
  progress: number;
  output?: AssetRef;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type SceneQuality = "low" | "medium" | "high";

export interface ScenePlugin {
  id: string;
  version: number;
  label: string;
  preload(quality: SceneQuality): Promise<void>;
  applyQuality(quality: SceneQuality): void;
  dispose(): void;
}

export interface CommerceProvider {
  id: string;
  enabled: boolean;
  createCheckout(snapshotId: string, idempotencyKey: string): Promise<{ url: string }>;
}

export interface StyleProvider {
  id: "identity" | string;
  version: number;
}

export interface FillProvider {
  id: "none" | string;
  version: number;
}

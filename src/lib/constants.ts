import type { CameraState, CropTransform } from "@/lib/contracts";

export const APP_NAME = "ReflectCup Studio";
export const SESSION_COOKIE_NAME = "reflectcup_session";
export const ADMIN_COOKIE_NAME = "reflectcup_admin";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 60_000_000;
export const PREVIEW_SIZE = 1024;
export const PRODUCTION_SIZE = 4096;

export const DEFAULT_CROP: CropTransform = {
  centerX: 0.5,
  centerY: 0.5,
  scale: 1
};

export const DEFAULT_CAMERA: CameraState = {
  position: [0.6, 0.48, 0],
  target: [-0.03, 0.043, 0]
};

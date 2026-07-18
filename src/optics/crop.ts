import type { CropTransform } from "@/lib/contracts";
import { clamp } from "./math";
import type { Vec2 } from "./types";

export const MIN_CROP_SCALE = 1;
export const MAX_CROP_SCALE = 8;

export function sourceCoverSpan(sourceWidth: number, sourceHeight: number): Vec2 {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Source dimensions must be positive finite numbers");
  }
  const aspect = sourceWidth / sourceHeight;
  return aspect >= 1 ? [1 / aspect, 1] : [1, aspect];
}

export function constrainCrop(
  crop: CropTransform,
  sourceWidth: number,
  sourceHeight: number
): CropTransform {
  const scale = clamp(Number.isFinite(crop.scale) ? crop.scale : 1, MIN_CROP_SCALE, MAX_CROP_SCALE);
  const cover = sourceCoverSpan(sourceWidth, sourceHeight);
  const halfWidth = cover[0] / scale / 2;
  const halfHeight = cover[1] / scale / 2;
  return {
    centerX: clamp(Number.isFinite(crop.centerX) ? crop.centerX : 0.5, halfWidth, 1 - halfWidth),
    centerY: clamp(Number.isFinite(crop.centerY) ? crop.centerY : 0.5, halfHeight, 1 - halfHeight),
    scale
  };
}

/** Maps desired-image UV into normalized source-image UV using cover semantics. */
export function targetUvToSourceUv(
  targetUv: Vec2,
  crop: CropTransform,
  sourceWidth: number,
  sourceHeight: number
): Vec2 {
  const safeCrop = constrainCrop(crop, sourceWidth, sourceHeight);
  const cover = sourceCoverSpan(sourceWidth, sourceHeight);
  return [
    safeCrop.centerX + (targetUv[0] - 0.5) * cover[0] / safeCrop.scale,
    safeCrop.centerY + (targetUv[1] - 0.5) * cover[1] / safeCrop.scale
  ];
}

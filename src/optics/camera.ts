import type { CameraState, Vec3Tuple } from "@/lib/contracts";

import { clamp } from "./math";

export const MIN_CAMERA_DISTANCE = 0.22;
export const MAX_CAMERA_DISTANCE = 0.9;
export const MIN_CAMERA_POLAR_DEGREES = 15;
export const MAX_CAMERA_POLAR_DEGREES = 75;

function delta(position: Vec3Tuple, target: Vec3Tuple): Vec3Tuple {
  return [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
}

/** Canonicalizes persisted orbit state to the limits used by the viewer. */
export function constrainCamera(
  requested: CameraState,
  opticalTarget: Vec3Tuple,
  fallbackPosition: Vec3Tuple
): CameraState {
  let offset = delta(requested.position, opticalTarget);
  let radius = Math.hypot(offset[0], offset[1], offset[2]);
  if (!Number.isFinite(radius) || radius < 1e-9) {
    offset = delta(fallbackPosition, opticalTarget);
    radius = Math.hypot(offset[0], offset[1], offset[2]);
  }
  const distance = clamp(radius, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
  const polar = clamp(
    Math.acos(clamp(offset[1] / radius, -1, 1)),
    MIN_CAMERA_POLAR_DEGREES * Math.PI / 180,
    MAX_CAMERA_POLAR_DEGREES * Math.PI / 180
  );
  const azimuth = Math.atan2(offset[2], offset[0]);
  const horizontal = Math.sin(polar) * distance;
  return {
    position: [
      opticalTarget[0] + Math.cos(azimuth) * horizontal,
      opticalTarget[1] + Math.cos(polar) * distance,
      opticalTarget[2] + Math.sin(azimuth) * horizontal
    ],
    target: [...opticalTarget]
  };
}

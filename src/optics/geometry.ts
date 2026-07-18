import {
  EPSILON,
  add3,
  cross3,
  dot3,
  normalize3,
  pointOnRay,
  reflect3,
  scale3,
  solveQuadratic,
  sub3
} from "./math";
import type { OpticalProfile, Ray, Vec2, Vec3 } from "./types";

export type SurfaceHit = {
  distance: number;
  point: Vec3;
  normal: Vec3;
};

export function makeTargetCameraRay(profile: OpticalProfile, targetUv: Vec2): Ray {
  const camera = profile.designCamera;
  const forward = normalize3(sub3(camera.targetFrame.center, camera.position));
  const right = normalize3(cross3(forward, camera.up));
  const screenUp = normalize3(cross3(right, forward));
  const horizontal = (targetUv[0] - 0.5) * camera.targetFrame.width;
  const vertical = (0.5 - targetUv[1]) * camera.targetFrame.height;
  const targetPoint = add3(
    camera.targetFrame.center,
    add3(scale3(right, horizontal), scale3(screenUp, vertical))
  );

  return {
    origin: camera.position,
    direction: normalize3(sub3(targetPoint, camera.position))
  };
}

/** Intersects a surface of revolution whose radius is piecewise-linear in Y. */
export function intersectRadialCup(
  ray: Ray,
  cup: OpticalProfile["cup"],
  minimumDistance = 1e-6
): SurfaceHit | null {
  const points = cup.radialProfile;
  if (points.length < 2) return null;

  const ox = ray.origin[0] - cup.axisOrigin[0];
  const oy = ray.origin[1] - cup.axisOrigin[1];
  const oz = ray.origin[2] - cup.axisOrigin[2];
  const [dx, dy, dz] = ray.direction;
  let nearest: SurfaceHit | null = null;

  for (let index = 0; index < points.length - 1; index += 1) {
    const lower = points[index];
    const upper = points[index + 1];
    if (upper.y <= lower.y || lower.radius <= 0 || upper.radius <= 0) continue;

    const slope = (upper.radius - lower.radius) / (upper.y - lower.y);
    const intercept = lower.radius - slope * lower.y;
    // radius(y) = slope * localY + intercept
    const radialAtOrigin = slope * oy + intercept;
    const radialAlongRay = slope * dy;
    const a = dx * dx + dz * dz - radialAlongRay * radialAlongRay;
    const b = 2 * (ox * dx + oz * dz - radialAtOrigin * radialAlongRay);
    const c = ox * ox + oz * oz - radialAtOrigin * radialAtOrigin;

    for (const distance of solveQuadratic(a, b, c)) {
      if (distance <= minimumDistance || (nearest && distance >= nearest.distance)) continue;
      const localY = oy + distance * dy;
      if (localY < lower.y - EPSILON || localY > upper.y + EPSILON) continue;

      const point = pointOnRay(ray, distance);
      const qx = point[0] - cup.axisOrigin[0];
      const qz = point[2] - cup.axisOrigin[2];
      const radialLength = Math.hypot(qx, qz);
      if (radialLength < EPSILON) continue;
      const normal = normalize3([qx / radialLength, -slope, qz / radialLength]);
      nearest = { distance, point, normal };
    }
  }

  return nearest;
}

/** Intersects only the printable, upward-facing lower spherical cap. */
export function intersectDishCap(
  ray: Ray,
  dish: OpticalProfile["dish"],
  minimumDistance = 1e-5
): SurfaceHit | null {
  const sphereCenter: Vec3 = [
    dish.center[0],
    dish.center[1] + dish.sphereRadius,
    dish.center[2]
  ];
  const relativeOrigin = sub3(ray.origin, sphereCenter);
  const a = dot3(ray.direction, ray.direction);
  const b = 2 * dot3(relativeOrigin, ray.direction);
  const c = dot3(relativeOrigin, relativeOrigin) - dish.sphereRadius * dish.sphereRadius;

  for (const distance of solveQuadratic(a, b, c)) {
    if (distance <= minimumDistance) continue;
    const point = pointOnRay(ray, distance);
    const x = point[0] - dish.center[0];
    const z = point[2] - dish.center[2];
    const radialDistance = Math.hypot(x, z);
    if (radialDistance > dish.radius + EPSILON) continue;
    if (point[1] > dish.center[1] + dish.sag + EPSILON) continue;
    // The sign is immaterial for reflection, but +Y is useful to render/debug.
    const normal = normalize3(scale3(sub3(point, sphereCenter), -1));
    return { distance, point, normal };
  }
  return null;
}

export function worldPointToPlateUv(point: Vec3, dish: OpticalProfile["dish"]): Vec2 {
  const diameter = dish.radius * 2;
  return [
    0.5 + (point[0] - dish.center[0]) / diameter,
    0.5 - (point[2] - dish.center[2]) / diameter
  ];
}

export function plateUvToWorldPoint(plateUv: Vec2, dish: OpticalProfile["dish"]): Vec3 | null {
  const x = dish.center[0] + (plateUv[0] - 0.5) * dish.radius * 2;
  const z = dish.center[2] + (0.5 - plateUv[1]) * dish.radius * 2;
  const radialSquared = (x - dish.center[0]) ** 2 + (z - dish.center[2]) ** 2;
  if (radialSquared > dish.radius * dish.radius) return null;
  const y = dish.center[1] + dish.sphereRadius - Math.sqrt(
    Math.max(0, dish.sphereRadius * dish.sphereRadius - radialSquared)
  );
  return [x, y, z];
}

export function traceTargetToPlate(profile: OpticalProfile, targetUv: Vec2) {
  const cameraRay = makeTargetCameraRay(profile, targetUv);
  const cupHit = intersectRadialCup(cameraRay, profile.cup);
  if (!cupHit) return null;

  const reflectedDirection = normalize3(reflect3(cameraRay.direction, cupHit.normal));
  const reflectedRay: Ray = {
    origin: add3(cupHit.point, scale3(reflectedDirection, 1e-5)),
    direction: reflectedDirection
  };
  const plateHit = intersectDishCap(reflectedRay, profile.dish);
  if (!plateHit) return null;

  return {
    targetUv,
    plateUv: worldPointToPlateUv(plateHit.point, profile.dish),
    cupPoint: cupHit.point,
    platePoint: plateHit.point
  } as const;
}

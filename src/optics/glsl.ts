import type { OpticalProfile, Vec3 } from "./types";

/**
 * Shared GLSL3 ray/dish contract. The caller supplies world-space values.
 * Keep this in lockstep with geometry.intersectDishCap/worldPointToPlateUv.
 */
export const DISH_REFLECTION_GLSL = /* glsl */ `
bool reflectCupIntersectDish(
  vec3 rayOrigin,
  vec3 rayDirection,
  vec3 dishCenter,
  float dishRadius,
  float sphereRadius,
  float dishSag,
  out vec3 dishHit
) {
  vec3 sphereCenter = dishCenter + vec3(0.0, sphereRadius, 0.0);
  vec3 relativeOrigin = rayOrigin - sphereCenter;
  float halfB = dot(relativeOrigin, rayDirection);
  float c = dot(relativeOrigin, relativeOrigin) - sphereRadius * sphereRadius;
  float discriminant = halfB * halfB - c;
  if (discriminant < 0.0) return false;

  float root = sqrt(discriminant);
  float nearDistance = -halfB - root;
  float farDistance = -halfB + root;
  float hitDistance = nearDistance > 0.00001 ? nearDistance : farDistance;
  if (hitDistance <= 0.00001) return false;

  dishHit = rayOrigin + rayDirection * hitDistance;
  vec2 radial = dishHit.xz - dishCenter.xz;
  if (dot(radial, radial) > dishRadius * dishRadius) return false;
  return dishHit.y >= dishCenter.y - 0.00001
    && dishHit.y <= dishCenter.y + dishSag + 0.00001;
}

vec2 reflectCupPrintUv(vec3 dishHit, vec3 dishCenter, float dishRadius) {
  vec2 local = dishHit.xz - dishCenter.xz;
  return vec2(
    0.5 + local.x / (2.0 * dishRadius),
    0.5 - local.y / (2.0 * dishRadius)
  );
}
`;

export type DishReflectionParameters = {
  dishCenter: Vec3;
  dishRadius: number;
  sphereRadius: number;
  dishSag: number;
};

export function getDishReflectionParameters(profile: OpticalProfile): DishReflectionParameters {
  return {
    dishCenter: profile.dish.center,
    dishRadius: profile.dish.radius,
    sphereRadius: profile.dish.sphereRadius,
    dishSag: profile.dish.sag
  };
}

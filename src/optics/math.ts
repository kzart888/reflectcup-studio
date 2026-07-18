import type { Ray, Vec2, Vec3 } from "./types";

export const EPSILON = 1e-9;

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function length3(value: Vec3): number {
  return Math.sqrt(dot3(value, value));
}

export function normalize3(value: Vec3): Vec3 {
  const length = length3(value);
  if (length < EPSILON) {
    throw new Error("Cannot normalize a zero-length vector");
  }
  return scale3(value, 1 / length);
}

/** GLSL-compatible reflect(I, N). Both vectors are expected to be normalized. */
export function reflect3(incident: Vec3, normal: Vec3): Vec3 {
  return sub3(incident, scale3(normal, 2 * dot3(incident, normal)));
}

export function pointOnRay(ray: Ray, distance: number): Vec3 {
  return add3(ray.origin, scale3(ray.direction, distance));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function signedArea2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) return [];
    return [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  if (Math.abs(discriminant) <= EPSILON) return [-b / (2 * a)];
  const root = Math.sqrt(discriminant);
  // This form avoids catastrophic cancellation for grazing rays.
  const q = -0.5 * (b + Math.sign(b || 1) * root);
  const first = q / a;
  const second = c / q;
  return first < second ? [first, second] : [second, first];
}

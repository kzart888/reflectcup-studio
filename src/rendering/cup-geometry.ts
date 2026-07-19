import * as THREE from "three";

import type { OpticalProfile, RadialProfilePoint } from "@/optics";

export const CUP_WALL_THICKNESS = 0.002;
export const CUP_RIM_RADIUS = 0.001;
export const CUP_HANDLE_RADIUS = 0.0035;

function tangentAt(points: readonly RadialProfilePoint[], index: number): THREE.Vector2 {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  return new THREE.Vector2(next.radius - previous.radius, next.y - previous.y).normalize();
}

export function createInnerCupProfile(
  profile: OpticalProfile,
  thickness = CUP_WALL_THICKNESS,
): readonly RadialProfilePoint[] {
  return profile.cup.radialProfile.map((point, index, points) => {
    const tangent = tangentAt(points, index);
    return {
      radius: Math.max(0.001, point.radius - tangent.y * thickness),
      y: point.y + tangent.x * thickness,
    };
  });
}

export function createInnerCupGeometry(
  profile: OpticalProfile,
  radialSegments = 128,
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    createInnerCupProfile(profile).map((point) => new THREE.Vector2(point.radius, point.y)),
    radialSegments,
  );
}

function radiusAt(profile: OpticalProfile, y: number): number {
  const points = profile.cup.radialProfile;
  if (y <= points[0].y) return points[0].radius;
  if (y >= points.at(-1)!.y) return points.at(-1)!.radius;
  for (let index = 0; index < points.length - 1; index += 1) {
    const lower = points[index];
    const upper = points[index + 1];
    if (y <= upper.y) {
      const t = (y - lower.y) / (upper.y - lower.y);
      return THREE.MathUtils.lerp(lower.radius, upper.radius, t);
    }
  }
  return points.at(-1)!.radius;
}

export function createCupHandleGeometry(profile: OpticalProfile): THREE.TubeGeometry {
  const bottom = profile.cup.radialProfile[0].y;
  const top = profile.cup.radialProfile.at(-1)!.y;
  const attachBottomY = THREE.MathUtils.lerp(bottom, top, 0.29);
  const attachTopY = THREE.MathUtils.lerp(bottom, top, 0.76);
  const middleY = (attachBottomY + attachTopY) / 2;
  const attachBottomX = -radiusAt(profile, attachBottomY) + 0.0012;
  const attachTopX = -radiusAt(profile, attachTopY) + 0.0012;
  // With the cup axis at X=-30 mm and the plate rim at X=-91.246 mm,
  // -57 mm local plus the 3.5 mm tube radius remains inside the plate rim.
  const farX = -0.057;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(attachTopX, attachTopY, 0),
    new THREE.Vector3(-0.052, THREE.MathUtils.lerp(middleY, attachTopY, 0.72), 0),
    new THREE.Vector3(farX, middleY, 0),
    new THREE.Vector3(-0.052, THREE.MathUtils.lerp(attachBottomY, middleY, 0.28), 0),
    new THREE.Vector3(attachBottomX, attachBottomY, 0),
  ], false, "centripetal");
  return new THREE.TubeGeometry(curve, 48, CUP_HANDLE_RADIUS, 12, false);
}

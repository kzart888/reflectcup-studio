import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createCurvedCupOpticalProfileV3 } from "@/optics";
import {
  createCupHandleGeometry,
  createInnerCupGeometry,
  CUP_RIM_RADIUS,
  CUP_WALL_THICKNESS,
} from "@/rendering/cup-geometry";
import { createDishGeometry, createDishSolidGeometry } from "@/rendering/dish-geometry";
import {
  ADAPTIVE_SUBJECT_RENDERER_VERSION,
  groundedSkyboxResolution,
  subjectGeometryDetail,
} from "@/rendering/subject-quality";

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

describe("preview subject quality", () => {
  it("keeps the Low reflective subject below 45k submitted triangles", () => {
    const profile = createCurvedCupOpticalProfileV3({ status: "published" });
    const detail = subjectGeometryDetail("low", ADAPTIVE_SUBJECT_RENDERER_VERSION);
    const top = profile.cup.radialProfile.at(-1)!;
    const bottom = profile.cup.radialProfile[0];
    const dishTop = createDishGeometry(profile, detail.dishRadialSegments, detail.dishAngularSegments);
    const geometries = [
      new THREE.LatheGeometry(
        profile.cup.radialProfile.map((point) => new THREE.Vector2(point.radius, point.y)),
        detail.cupOuterSegments,
      ),
      createInnerCupGeometry(profile, detail.cupInnerSegments),
      createCupHandleGeometry(profile, detail.cupHandleTubularSegments, detail.cupHandleRadialSegments),
      new THREE.TorusGeometry(top.radius - CUP_RIM_RADIUS, CUP_RIM_RADIUS, 8, detail.cupRimTubularSegments),
      new THREE.CylinderGeometry(bottom.radius, bottom.radius, CUP_WALL_THICKNESS, detail.cupBaseSegments),
      new THREE.CircleGeometry(
        Math.max(0.001, bottom.radius - CUP_WALL_THICKNESS),
        detail.cupBaseSegments,
      ),
      dishTop,
      createDishSolidGeometry(profile, 0.002, detail.dishRadialSegments, detail.dishAngularSegments),
      new THREE.TorusGeometry(profile.dish.radius - 0.0006, 0.0006, 6, detail.dishRimTubularSegments),
    ];

    // The v3 contact-AO pass submits the printable dish geometry once more.
    const submittedTriangles = geometries.reduce((sum, geometry) => sum + triangleCount(geometry), 0)
      + triangleCount(dishTop);
    expect(submittedTriangles).toBeLessThan(45_000);
    geometries.forEach((geometry) => geometry.dispose());
  });

  it("keeps immutable legacy renderers at their original full tessellation", () => {
    const legacy = subjectGeometryDetail("low", "reflective-subject-glsl3-v3");
    const current = subjectGeometryDetail("low", ADAPTIVE_SUBJECT_RENDERER_VERSION);

    expect(legacy).toMatchObject({
      cupOuterSegments: 128,
      cupInnerSegments: 128,
      dishRadialSegments: 42,
      dishAngularSegments: 128,
    });
    expect(current.cupOuterSegments).toBeLessThan(legacy.cupOuterSegments);
    expect(current.dishAngularSegments).toBeLessThan(legacy.dishAngularSegments);
  });

  it("reduces only the grounded projection mesh on constrained tiers", () => {
    expect(groundedSkyboxResolution("low", 64)).toBe(32);
    expect(groundedSkyboxResolution("medium", 64)).toBe(48);
    expect(groundedSkyboxResolution("high", 64)).toBe(64);
  });
});

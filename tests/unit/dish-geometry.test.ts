import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createNominalOpticalProfile } from "@/optics";
import { createDishGeometry, createDishSolidGeometry } from "@/rendering/dish-geometry";

describe("dish geometry", () => {
  it("winds the printable surface toward +Y", () => {
    const geometry = createDishGeometry(createNominalOpticalProfile(), 4, 8);
    const positions = geometry.getAttribute("position");
    const indices = geometry.index!;

    // The centre fan is degenerate, so inspect the first triangle of ring 1.
    const triangleOffset = 8 * 6;
    const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangleOffset));
    const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangleOffset + 1));
    const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangleOffset + 2));
    const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();

    expect(faceNormal.y).toBeGreaterThan(0.99);
  });

  it("adds a paired two millimetre underside without moving the printable top", () => {
    const profile = createNominalOpticalProfile();
    const radialSegments = 4;
    const angularSegments = 8;
    const top = createDishGeometry(profile, radialSegments, angularSegments);
    const solid = createDishSolidGeometry(profile, 0.002, radialSegments, angularSegments);
    const topPositions = top.getAttribute("position");
    const solidPositions = solid.getAttribute("position");
    const solidNormals = solid.getAttribute("normal");
    const bottomOffset = topPositions.count;

    for (let index = 0; index < topPositions.count; index += 1) {
      expect(solidPositions.getX(index)).toBeCloseTo(topPositions.getX(index), 10);
      expect(solidPositions.getY(index)).toBeCloseTo(topPositions.getY(index), 10);
      expect(solidPositions.getZ(index)).toBeCloseTo(topPositions.getZ(index), 10);
      expect(solidPositions.getX(bottomOffset + index)).toBeCloseTo(topPositions.getX(index), 10);
      expect(solidPositions.getY(bottomOffset + index)).toBeCloseTo(topPositions.getY(index) - 0.002, 8);
      expect(solidPositions.getZ(bottomOffset + index)).toBeCloseTo(topPositions.getZ(index), 10);
      expect(solidNormals.getY(bottomOffset + index)).toBeCloseTo(-solidNormals.getY(index), 10);
    }

    expect(solidPositions.count).toBeGreaterThan(topPositions.count * 2);
    top.dispose();
    solid.dispose();
  });
});

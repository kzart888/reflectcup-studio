import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createNominalOpticalProfile } from "@/optics";
import { createDishGeometry } from "@/rendering/dish-geometry";

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
});

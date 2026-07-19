import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { createEnvironmentRotation } from "@/rendering/ReflectiveCupPreview";
import { cupFragmentShader } from "@/rendering/shaders";

describe("cup mirror shader contract", () => {
  it("uses the transposed Three.js environment-rotation convention", () => {
    const rotation = 0.73;
    const expected = new THREE.Matrix3()
      .setFromMatrix4(new THREE.Matrix4().makeRotationY(rotation))
      .transpose();

    expect(createEnvironmentRotation(rotation).elements).toEqual(expected.elements);
  });

  it("treats an unprinted dish hit as opaque ceramic rather than environment", () => {
    expect(cupFragmentShader).toContain("bool dishWasHit = reflectCupIntersectDish");
    expect(cupFragmentShader).toContain("if (dishWasHit)");
    expect(cupFragmentShader).toContain("reflectedColor = mix(dishBaseColor, printed.rgb, printed.a)");
    expect(cupFragmentShader).not.toContain("mix(mirrorColor, printed.rgb");
  });
});

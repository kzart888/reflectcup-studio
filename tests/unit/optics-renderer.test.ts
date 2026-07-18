import { describe, expect, it } from "vitest";
import {
  constrainCamera,
  constrainCrop,
  IDENTITY_STYLE,
  NO_FILL,
  renderCanonicalPlate,
  sourceCoverSpan,
  targetUvToSourceUv
} from "@/optics";
import type { PlateTargetLut, RawRgbaImage } from "@/optics";

describe("crop transform", () => {
  it("uses cover semantics for landscape and portrait inputs", () => {
    expect(sourceCoverSpan(400, 200)).toEqual([0.5, 1]);
    expect(sourceCoverSpan(200, 400)).toEqual([1, 0.5]);
    expect(targetUvToSourceUv([0, 0], { centerX: 0.5, centerY: 0.5, scale: 1 }, 400, 200))
      .toEqual([0.25, 0]);
    expect(targetUvToSourceUv([1, 1], { centerX: 0.5, centerY: 0.5, scale: 2 }, 400, 200))
      .toEqual([0.625, 0.75]);
  });

  it("clamps scale and pan so the mapped image cannot expose an edge", () => {
    expect(constrainCrop({ centerX: -10, centerY: 10, scale: 100 }, 400, 200)).toEqual({
      centerX: 0.03125,
      centerY: 0.9375,
      scale: 8
    });
  });
});

describe("camera persistence limits", () => {
  it("keeps the profile target fixed and clamps distance and polar angle", () => {
    const target = [-0.03, 0.043, 0] as const;
    const camera = constrainCamera(
      { position: [100, 100, 100], target: [50, 50, 50] },
      target,
      [0.6, 0.48, 0]
    );
    expect(camera.target).toEqual(target);
    const offset = camera.position.map((value, index) => value - target[index]);
    const distance = Math.hypot(...offset);
    const polarDegrees = Math.acos(offset[1] / distance) * 180 / Math.PI;
    expect(distance).toBeCloseTo(0.9, 8);
    expect(polarDegrees).toBeGreaterThanOrEqual(15);
    expect(polarDegrees).toBeLessThanOrEqual(75);
  });
});

describe("canonical plate renderer", () => {
  const red: RawRgbaImage = {
    width: 1,
    height: 1,
    data: new Uint8Array([240, 20, 10, 255])
  };
  const sparseLut: PlateTargetLut = {
    width: 2,
    height: 2,
    targetUv: new Float32Array([
      0.5, 0.5,
      0, 0,
      0, 0,
      0, 0
    ]),
    validMask: new Uint8Array([255, 0, 0, 0])
  };

  it("renders mapped pixels and leaves non-reflected pixels transparent", () => {
    const output = renderCanonicalPlate({
      size: 2,
      source: red,
      lut: sparseLut,
      crop: { centerX: 0.5, centerY: 0.5, scale: 1 }
    });
    expect([...output.data.slice(0, 4)]).toEqual([240, 20, 10, 255]);
    expect([...output.data.slice(4)]).toEqual(new Array(12).fill(0));
  });

  it("ships only explicit identity-style and no-fill defaults", () => {
    expect(IDENTITY_STYLE.transform([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(NO_FILL.fill([0.5, 0.5])).toBeNull();
  });

  it("rejects malformed source buffers", () => {
    expect(() => renderCanonicalPlate({
      size: 2,
      source: { width: 2, height: 2, data: new Uint8Array(3) },
      lut: sparseLut,
      crop: { centerX: 0.5, centerY: 0.5, scale: 1 }
    })).toThrow(/buffer length/);
  });
});

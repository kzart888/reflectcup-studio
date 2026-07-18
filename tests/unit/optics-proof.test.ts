import { describe, expect, it } from "vitest";
import { renderOpticalProof, sampleTargetPlateMap } from "@/optics/proof";
import type { RawRgbaImage, TargetPlateMap } from "@/optics/types";

const map: TargetPlateMap = {
  width: 2,
  height: 2,
  samples: [
    { targetUv: [0, 0], plateUv: [0, 0], cupPoint: [0, 0, 0], platePoint: [0, 0, 0] },
    { targetUv: [1, 0], plateUv: [1, 0], cupPoint: [0, 0, 0], platePoint: [0, 0, 0] },
    { targetUv: [0, 1], plateUv: [0, 1], cupPoint: [0, 0, 0], platePoint: [0, 0, 0] },
    { targetUv: [1, 1], plateUv: [1, 1], cupPoint: [0, 0, 0], platePoint: [0, 0, 0] }
  ]
};

describe("optical proof", () => {
  it("bilinearly replays a target-to-plate map", () => {
    expect(sampleTargetPlateMap(map, [0.25, 0.75])).toEqual([0.25, 0.75]);
  });

  it("recovers an identity plate image", () => {
    const plate: RawRgbaImage = {
      width: 2,
      height: 2,
      data: new Uint8Array([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 255, 255, 255
      ])
    };
    const proof = renderOpticalProof(plate, map, 2);
    expect(proof.data[3]).toBe(255);
    expect(proof.data[15]).toBe(255);
    expect(proof.data[0]).toBeGreaterThan(proof.data[1]);
    expect(proof.data[12]).toBeGreaterThan(plate.data[8]);
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  createCurvedCupOpticalProfile,
  createCurvedCupOpticalProfileV3,
  generateTargetPlateMap,
  MAX_CORE_TARGET_ROUND_TRIP_SAMPLES,
  opticalProfileSchema,
  samplePlateTargetLut,
} from "@/optics";
import type { PlateTargetLut } from "@/optics";

const V2_DIRECTORY = "public/optical-profiles/curved-cup-v2";
const V3_DIRECTORY = "public/optical-profiles/curved-cup-v3";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadPublishedLut(directory: string): PlateTargetLut {
  const uvBytes = Uint8Array.from(readFileSync(`${directory}/plate-to-target.rg32f`));
  return {
    width: 512,
    height: 512,
    targetUv: new Float32Array(uvBytes.buffer),
    validMask: Uint8Array.from(readFileSync(`${directory}/plate-valid-mask.bin`)),
  };
}

describe("curved cup reversible optical profile v3", () => {
  it("reuses the exact audited v2 geometry while publishing a new mapping contract", () => {
    const v2 = createCurvedCupOpticalProfile({ status: "published" });
    const v3 = createCurvedCupOpticalProfileV3({ status: "published" });

    expect(v3.id).toBe("curved-cup-80-dish-182-v3");
    expect(v3.slug).toBe(v2.slug);
    expect(v3.version).toBe(3);
    expect(v3.cup).toEqual(v2.cup);
    expect(v3.dish).toEqual(v2.dish);
    expect(v3.designCamera).toEqual(v2.designCamera);
    expect(v3.checksums.geometry).toBe(v2.checksums.geometry);
    expect(v3.checksums.generator).not.toBe(v2.checksums.generator);
    expect(opticalProfileSchema.parse(v3)).toEqual(v3);
  });

  it("keeps every published inverse-LUT hit inside the published target core", async () => {
    const lut = loadPublishedLut(V3_DIRECTORY);
    const core = await sharp(`${V3_DIRECTORY}/target-core-mask.png`).greyscale().raw().toBuffer();
    let validHits = 0;

    for (let index = 0; index < lut.validMask.length; index += 1) {
      if (lut.validMask[index] === 0) continue;
      validHits += 1;
      const targetX = Math.round(lut.targetUv[index * 2] * 512);
      const targetY = Math.round(lut.targetUv[index * 2 + 1] * 512);
      expect(core[targetY * 513 + targetX]).toBe(255);
    }

    expect(validHits).toBeGreaterThan(150_000);
  });

  it("round-trips every published core sample through plate space within one target sample", async () => {
    const profile = createCurvedCupOpticalProfileV3({ status: "published" });
    const map = generateTargetPlateMap(profile);
    const lut = loadPublishedLut(V3_DIRECTORY);
    const core = await sharp(`${V3_DIRECTORY}/target-core-mask.png`).greyscale().raw().toBuffer();
    const errors: number[] = [];

    for (let index = 0; index < core.length; index += 1) {
      if (core[index] === 0) continue;
      const targetX = index % map.width;
      const targetY = Math.floor(index / map.width);
      let interior = true;
      for (let offsetY = -2; offsetY <= 2 && interior; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          const x = targetX + offsetX;
          const y = targetY + offsetY;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height || core[y * map.width + x] === 0) {
            interior = false;
            break;
          }
        }
      }
      if (!interior) continue;
      const sample = map.samples[index];
      expect(sample).not.toBeNull();
      const inverse = sample && samplePlateTargetLut(lut, sample.plateUv);
      expect(inverse).not.toBeNull();
      if (!sample || !inverse) continue;
      errors.push(Math.hypot(
        (inverse[0] - sample.targetUv[0]) * (map.width - 1),
        (inverse[1] - sample.targetUv[1]) * (map.height - 1),
      ));
    }

    errors.sort((left, right) => left - right);
    expect(errors).toHaveLength(108_811);
    expect(errors[Math.floor(errors.length * 0.95)]).toBeLessThanOrEqual(0.25);
    expect(errors.at(-1)).toBeLessThanOrEqual(MAX_CORE_TARGET_ROUND_TRIP_SAMPLES);
  }, 15_000);

  it("ships a content-verified v3 bundle and pins all previously published v2 bytes", () => {
    const v3Manifest = JSON.parse(readFileSync(`${V3_DIRECTORY}/manifest.json`, "utf8")) as {
      profileId: string;
      profileVersion: number;
      files: Record<string, { sha256: string }>;
    };
    expect(v3Manifest.profileId).toBe("curved-cup-80-dish-182-v3");
    expect(v3Manifest.profileVersion).toBe(3);
    for (const [name, entry] of Object.entries(v3Manifest.files)) {
      expect(sha256(`${V3_DIRECTORY}/${name}`)).toBe(entry.sha256);
    }

    const immutableV2 = {
      "profile.json": "cb66341e56ff11508de0ba9e0dc8fbcadde3d104acbabfcb373072ad3650c47c",
      "plate-to-target.rg32f": "b16f9fada649ea4cf8d1183c2d1e3eca46521e336c60e55fabe391c7212bc461",
      "plate-valid-mask.bin": "6651688336ff4b34d88482e4cc95bcb77a9ef9406955b1875ad20d1b36a7f65b",
      "plate-valid-mask.png": "835fa0df26ab8ba692bda3e7518c5e7c4092afb749026cae28fde31c2748b357",
      "target-valid-mask.png": "8167afad5767ca0569f5cdbe11d69dd28b670e8bad30b0e7babd91a53bb84d90",
      "target-ray-hit-mask.png": "151b84cfc6508cb0327922733d72838b4c47c44f1fc148c76c6d719da2e381a8",
      "target-core-mask.png": "8167afad5767ca0569f5cdbe11d69dd28b670e8bad30b0e7babd91a53bb84d90",
      "target-core-contour.json": "2fd0b1b754fd82e4c7f98622b6e46925cb3c982dff6b569ed082cfd043a6480d",
    } as const;
    for (const [name, digest] of Object.entries(immutableV2)) {
      expect(sha256(`${V2_DIRECTORY}/${name}`)).toBe(digest);
    }
  });
});

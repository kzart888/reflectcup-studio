import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  buildTargetContourDocument,
  buildTargetCoreMask,
  buildTargetRayHitMask,
  createCurvedCupOpticalProfile,
  CURVED_CUP_RINGS_MM,
  fnv1a64,
  generateTargetPlateMap,
  opticalProfileSchema,
  resampleRadialProfile,
  samplePlateTargetLut,
  sampleMonotoneRadiusMm,
  traceTargetToPlate
} from "@/optics";
import type { PlateTargetLut } from "@/optics";

function componentSizes(mask: Uint8Array, width: number, height: number): number[] {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const sizes: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] !== 0) continue;
    let read = 0;
    let write = 0;
    queue[write++] = start;
    visited[start] = 1;
    while (read < write) {
      const pixel = queue[read++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (mask[next] === 0 || visited[next] !== 0) continue;
          visited[next] = 1;
          queue[write++] = next;
        }
      }
    }
    sizes.push(write);
  }
  return sizes.sort((left, right) => right - left);
}

describe("curved cup optical profile v2", () => {
  it("resamples the audited millimetre rings with a monotone PCHIP curve", () => {
    const radialProfile = resampleRadialProfile();
    expect(radialProfile.length).toBeGreaterThan(140);
    expect(radialProfile.length).toBeLessThan(160);
    expect(radialProfile[0]).toEqual({ y: 0.007088845, radius: 0.031952057 });
    expect(radialProfile.at(-1)).toEqual({ y: 0.079, radius: 0.04 });
    for (const ring of CURVED_CUP_RINGS_MM) {
      expect(sampleMonotoneRadiusMm(CURVED_CUP_RINGS_MM, ring.y)).toBeCloseTo(ring.radius, 10);
      expect(radialProfile.some((point) => (
        Math.abs(point.y - ring.y / 1000) < 1e-12 &&
        Math.abs(point.radius - ring.radius / 1000) < 1e-12
      ))).toBe(true);
    }
    for (let index = 1; index < radialProfile.length; index += 1) {
      expect(radialProfile[index].y - radialProfile[index - 1].y).toBeGreaterThan(0);
      expect(radialProfile[index].y - radialProfile[index - 1].y).toBeLessThanOrEqual(0.0005 + 1e-12);
      expect(radialProfile[index].radius).toBeGreaterThanOrEqual(radialProfile[index - 1].radius);
    }
  });

  it("publishes a distinct immutable v2 geometry contract at 513 target samples", () => {
    const profile = createCurvedCupOpticalProfile({ status: "published" });
    expect(profile.id).toBe("curved-cup-80-dish-182-v2");
    expect(profile.version).toBe(2);
    expect(profile.mapping.targetSamples).toEqual([513, 513]);
    expect(profile.cup.radialProfile).toEqual(resampleRadialProfile());
    expect(opticalProfileSchema.parse(profile)).toEqual(profile);
  });

  it("removes the disconnected, opposite-orientation top sheet from the customer region", () => {
    const profile = createCurvedCupOpticalProfile({ targetSamples: [129, 129], lutSize: [192, 192] });
    const map = generateTargetPlateMap(profile);
    const rayHit = buildTargetRayHitMask(map);
    const core = buildTargetCoreMask(profile, map);
    expect(componentSizes(rayHit, map.width, map.height).length).toBeGreaterThan(1);
    expect(componentSizes(core, map.width, map.height)).toHaveLength(1);
    expect(rayHit.slice(0, map.width * 10).some(Boolean)).toBe(true);
    expect(core.slice(0, map.width * 10).some(Boolean)).toBe(false);
    for (let index = 0; index < core.length; index += 1) {
      if (core[index]) expect(rayHit[index]).toBe(255);
    }

    const contour = buildTargetContourDocument(core, map.width, map.height);
    expect(contour.paths).toHaveLength(1);
    expect(contour.paths[0].role).toBe("outer");
    const content = {
      schemaVersion: contour.schemaVersion,
      coordinateSpace: contour.coordinateSpace,
      fillRule: contour.fillRule,
      sourceSize: contour.sourceSize,
      paths: contour.paths
    };
    expect(contour.checksum).toBe(fnv1a64(JSON.stringify(content)));
    for (const path of contour.paths) {
      for (const [x, y] of path.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("serializes interior holes as even-odd contour paths", () => {
    const width = 9;
    const height = 9;
    const mask = new Uint8Array(width * height);
    for (let y = 1; y <= 7; y += 1) {
      for (let x = 1; x <= 7; x += 1) mask[y * width + x] = 255;
    }
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) mask[y * width + x] = 0;
    }
    const contour = buildTargetContourDocument(mask, width, height);
    expect(contour.fillRule).toBe("evenodd");
    expect(contour.paths.map((path) => path.role).sort()).toEqual(["hole", "outer"]);
  });

  it("keeps the published v2 inverse LUT inside the millimetre error budget", () => {
    const directory = "public/optical-profiles/curved-cup-v2";
    const profile = opticalProfileSchema.parse(JSON.parse(readFileSync(`${directory}/profile.json`, "utf8")));
    const uvBytes = Uint8Array.from(readFileSync(`${directory}/plate-to-target.rg32f`));
    const mask = Uint8Array.from(readFileSync(`${directory}/plate-valid-mask.bin`));
    const lut: PlateTargetLut = {
      width: 512,
      height: 512,
      targetUv: new Float32Array(uvBytes.buffer),
      validMask: mask
    };
    const errors: number[] = [];
    const targetMargin = 2 / (profile.mapping.targetSamples[0] - 1);
    for (let y = 2; y < lut.height - 2; y += 1) {
      for (let x = 2; x < lut.width - 2; x += 1) {
        let interior = true;
        for (let offsetY = -2; offsetY <= 2 && interior; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            if (mask[(y + offsetY) * lut.width + x + offsetX] === 0) {
              interior = false;
              break;
            }
          }
        }
        if (!interior) continue;
        const plateUv = [(x + 0.5) / lut.width, (y + 0.5) / lut.height] as const;
        const targetUv = samplePlateTargetLut(lut, plateUv);
        if (!targetUv || targetUv.some((coordinate) => (
          coordinate < targetMargin || coordinate > 1 - targetMargin
        ))) continue;
        const retraced = traceTargetToPlate(profile, targetUv);
        if (!retraced) continue;
        errors.push(Math.hypot(
          retraced.plateUv[0] - plateUv[0],
          retraced.plateUv[1] - plateUv[1]
        ) * profile.dish.radius * 2 * 1000);
      }
    }
    errors.sort((left, right) => left - right);
    expect(errors.length).toBeGreaterThan(100_000);
    expect(errors[Math.floor(errors.length * 0.95)]).toBeLessThanOrEqual(0.25);
    expect(errors.at(-1)).toBeLessThanOrEqual(0.75);
  });

  it("ships checksummed v2 core/debug assets while leaving nominal-v1 byte-identical", async () => {
    const directory = "public/optical-profiles/curved-cup-v2";
    const profile = opticalProfileSchema.parse(JSON.parse(readFileSync(`${directory}/profile.json`, "utf8")));
    const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, "utf8")) as {
      files: Record<string, { sha256: string }>;
    };
    expect(profile.mapping.targetSamples).toEqual([513, 513]);
    for (const [name, entry] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(readFileSync(`${directory}/${name}`)).digest("hex")).toBe(entry.sha256);
    }

    const core = await sharp(`${directory}/target-core-mask.png`).greyscale().raw().toBuffer();
    const rayHit = await sharp(`${directory}/target-ray-hit-mask.png`).greyscale().raw().toBuffer();
    expect(componentSizes(core, 513, 513)).toHaveLength(1);
    expect(componentSizes(rayHit, 513, 513).length).toBeGreaterThan(1);
    expect(readFileSync(`${directory}/target-valid-mask.png`)).toEqual(
      readFileSync(`${directory}/target-core-mask.png`)
    );

    const nominalGolden = {
      "profile.json": "5507602fba838ce53f16cf171687a34ee6a6632bbae167356873bfd5a6f65549",
      "plate-to-target.rg32f": "236e357e78b226809eac29a4c85bd3dc31919a646c3f5ddb302900b04bd6652a",
      "plate-valid-mask.bin": "e226e9c886fb9ae2df7f7d40434f3dec9f2c1c44bedb179dccb3ef347d0c9058",
      "target-valid-mask.png": "4a216223a707b3ed89080098b4e0fb27a1568d03ab283b7fe8edb67794fe8d53"
    };
    for (const [name, digest] of Object.entries(nominalGolden)) {
      expect(createHash("sha256")
        .update(readFileSync(`public/optical-profiles/nominal-v1/${name}`))
        .digest("hex")).toBe(digest);
    }
  });
});

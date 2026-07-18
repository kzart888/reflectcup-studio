import { fnv1a64 } from "./checksum";
import { distance2, signedArea2 } from "./math";
import { traceTargetToPlate } from "./geometry";
import type {
  GeneratedOpticalProfile,
  OpticalProfile,
  PlateTargetLut,
  TargetPlateMap,
  TargetPlateSample,
  Vec2
} from "./types";

type Triangle = readonly [TargetPlateSample, TargetPlateSample, TargetPlateSample];

export function generateTargetPlateMap(profile: OpticalProfile): TargetPlateMap {
  const [width, height] = profile.mapping.targetSamples;
  if (width < 2 || height < 2) {
    throw new Error("targetSamples must be at least 2 by 2");
  }
  const samples: (TargetPlateSample | null)[] = new Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetUv: Vec2 = [x / (width - 1), y / (height - 1)];
      samples[y * width + x] = traceTargetToPlate(profile, targetUv);
    }
  }
  return { width, height, samples };
}

function collectTriangles(profile: OpticalProfile, map: TargetPlateMap): Triangle[] {
  const triangles: Triangle[] = [];
  const maxUvEdge = profile.mapping.maxPlateEdge / (profile.dish.radius * 2);
  const at = (x: number, y: number) => map.samples[y * map.width + x];

  const append = (
    a: TargetPlateSample | null,
    b: TargetPlateSample | null,
    c: TargetPlateSample | null
  ) => {
    if (!a || !b || !c) return;
    const longest = Math.max(
      distance2(a.plateUv, b.plateUv),
      distance2(b.plateUv, c.plateUv),
      distance2(c.plateUv, a.plateUv)
    );
    if (longest > maxUvEdge) return;
    if (Math.abs(signedArea2(a.plateUv, b.plateUv, c.plateUv)) < 1e-10) return;
    triangles.push([a, b, c]);
  };

  for (let y = 0; y < map.height - 1; y += 1) {
    for (let x = 0; x < map.width - 1; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      append(a, b, c);
      append(a, c, d);
    }
  }
  return triangles;
}

function rasterizeTriangle(triangle: Triangle, lut: PlateTargetLut, orientation: number): void {
  const [a, b, c] = triangle;
  const area = signedArea2(a.plateUv, b.plateUv, c.plateUv);
  if (Math.sign(area) !== orientation) return;

  const minimumX = Math.max(0, Math.floor(Math.min(a.plateUv[0], b.plateUv[0], c.plateUv[0]) * lut.width - 0.5));
  const maximumX = Math.min(lut.width - 1, Math.ceil(Math.max(a.plateUv[0], b.plateUv[0], c.plateUv[0]) * lut.width - 0.5));
  const minimumY = Math.max(0, Math.floor(Math.min(a.plateUv[1], b.plateUv[1], c.plateUv[1]) * lut.height - 0.5));
  const maximumY = Math.min(lut.height - 1, Math.ceil(Math.max(a.plateUv[1], b.plateUv[1], c.plateUv[1]) * lut.height - 0.5));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const point: Vec2 = [(x + 0.5) / lut.width, (y + 0.5) / lut.height];
      const wa = signedArea2(point, b.plateUv, c.plateUv) / area;
      const wb = signedArea2(point, c.plateUv, a.plateUv) / area;
      const wc = 1 - wa - wb;
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;

      const pixel = y * lut.width + x;
      // A second hit indicates a folded mapping. Keep the first front-facing sheet.
      if (lut.validMask[pixel] !== 0) continue;
      lut.targetUv[pixel * 2] = wa * a.targetUv[0] + wb * b.targetUv[0] + wc * c.targetUv[0];
      lut.targetUv[pixel * 2 + 1] = wa * a.targetUv[1] + wb * b.targetUv[1] + wc * c.targetUv[1];
      lut.validMask[pixel] = 255;
    }
  }
}

export function invertTargetPlateMap(
  profile: OpticalProfile,
  map: TargetPlateMap = generateTargetPlateMap(profile)
): PlateTargetLut {
  const [width, height] = profile.mapping.lutSize;
  if (width < 2 || height < 2) throw new Error("lutSize must be at least 2 by 2");
  const lut: PlateTargetLut = {
    width,
    height,
    targetUv: new Float32Array(width * height * 2),
    validMask: new Uint8Array(width * height)
  };
  const triangles = collectTriangles(profile, map);
  let orientationVote = 0;
  for (const [a, b, c] of triangles) {
    orientationVote += Math.sign(signedArea2(a.plateUv, b.plateUv, c.plateUv));
  }
  const orientation = orientationVote < 0 ? -1 : 1;
  for (const triangle of triangles) rasterizeTriangle(triangle, lut, orientation);
  return lut;
}

export function buildTargetValidMask(map: TargetPlateMap): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  map.samples.forEach((sample, index) => {
    mask[index] = sample ? 255 : 0;
  });
  return mask;
}

export function generateOpticalProfile(profile: OpticalProfile): GeneratedOpticalProfile {
  const targetToPlate = generateTargetPlateMap(profile);
  const plateToTarget = invertTargetPlateMap(profile, targetToPlate);
  const lutChecksum = fnv1a64(plateToTarget.targetUv) + fnv1a64(plateToTarget.validMask);
  return {
    profile: {
      ...profile,
      checksums: { ...profile.checksums, lut: lutChecksum }
    },
    targetToPlate,
    plateToTarget
  };
}

import { fnv1a64 } from "./checksum";
import { buildTargetContourDocument } from "./contour";
import { distance2, signedArea2 } from "./math";
import { traceTargetToPlate } from "./geometry";
import { CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION } from "./profile";
import { samplePlateTargetLut } from "./renderer";
import type {
  GeneratedOpticalProfile,
  OpticalProfile,
  PlateTargetLut,
  TargetPlateMap,
  TargetPlateSample,
  Vec2
} from "./types";

type Triangle = readonly [TargetPlateSample, TargetPlateSample, TargetPlateSample];

export const MAX_CORE_TARGET_ROUND_TRIP_SAMPLES = 1;

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
  return { width, height, samples, profile };
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

function dominantTriangles(profile: OpticalProfile, map: TargetPlateMap): Triangle[] {
  const triangles = collectTriangles(profile, map);
  const orientationVote = triangles.reduce((vote, [a, b, c]) => (
    vote + Math.sign(signedArea2(a.plateUv, b.plateUv, c.plateUv))
  ), 0);
  const orientation = orientationVote < 0 ? -1 : 1;
  return triangles.filter(([a, b, c]) => (
    Math.sign(signedArea2(a.plateUv, b.plateUv, c.plateUv)) === orientation
  ));
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
  map: TargetPlateMap = generateTargetPlateMap(profile),
  targetMask?: Uint8Array,
): PlateTargetLut {
  const [width, height] = profile.mapping.lutSize;
  if (width < 2 || height < 2) throw new Error("lutSize must be at least 2 by 2");
  const lut: PlateTargetLut = {
    width,
    height,
    targetUv: new Float32Array(width * height * 2),
    validMask: new Uint8Array(width * height)
  };
  if (targetMask && targetMask.length !== map.width * map.height) {
    throw new Error("targetMask dimensions must match the target-to-plate map");
  }
  const triangles = dominantTriangles(profile, map).filter((triangle) => (
    !targetMask || triangle.every((sample) => {
      const x = Math.round(sample.targetUv[0] * (map.width - 1));
      const y = Math.round(sample.targetUv[1] * (map.height - 1));
      return targetMask[y * map.width + x] !== 0;
    })
  ));
  for (const triangle of triangles) rasterizeTriangle(triangle, lut, Math.sign(
    signedArea2(triangle[0].plateUv, triangle[1].plateUv, triangle[2].plateUv)
  ));
  return lut;
}

export function buildTargetRayHitMask(map: TargetPlateMap): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  map.samples.forEach((sample, index) => {
    mask[index] = sample ? 255 : 0;
  });
  return mask;
}

function keepLargestConnectedComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const visited = new Uint8Array(mask.length);
  let largest: number[] = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] !== 0) continue;
    let read = 0;
    let write = 0;
    queue[write++] = start;
    visited[start] = 1;
    const component: number[] = [];
    while (read < write) {
      const pixel = queue[read++];
      component.push(pixel);
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
    if (component.length > largest.length) largest = component;
  }
  const result = new Uint8Array(mask.length);
  for (const pixel of largest) result[pixel] = 255;
  return result;
}

function buildDominantTargetMask(profile: OpticalProfile, map: TargetPlateMap): Uint8Array {
  const accepted = new Uint8Array(map.width * map.height);
  for (const triangle of dominantTriangles(profile, map)) {
    for (const sample of triangle) {
      const x = Math.round(sample.targetUv[0] * (map.width - 1));
      const y = Math.round(sample.targetUv[1] * (map.height - 1));
      accepted[y * map.width + x] = 255;
    }
  }
  return keepLargestConnectedComponent(accepted, map.width, map.height);
}

export function buildTargetReversibleCoreMask(
  profile: OpticalProfile,
  map: TargetPlateMap,
  plateToTarget: PlateTargetLut,
  candidateMask: Uint8Array = buildDominantTargetMask(profile, map),
): Uint8Array {
  if (candidateMask.length !== map.width * map.height) {
    throw new Error("candidateMask dimensions must match the target-to-plate map");
  }
  const accepted = new Uint8Array(candidateMask.length);
  for (let index = 0; index < candidateMask.length; index += 1) {
    if (candidateMask[index] === 0) continue;
    const sample = map.samples[index];
    if (!sample) continue;
    const inverse = samplePlateTargetLut(plateToTarget, sample.plateUv);
    if (!inverse) continue;
    const errorInSamples = Math.hypot(
      (inverse[0] - sample.targetUv[0]) * (map.width - 1),
      (inverse[1] - sample.targetUv[1]) * (map.height - 1),
    );
    if (errorInSamples <= MAX_CORE_TARGET_ROUND_TRIP_SAMPLES) accepted[index] = 255;
  }
  return keepLargestConnectedComponent(accepted, map.width, map.height);
}

export function buildTargetCoreMask(profile: OpticalProfile, map: TargetPlateMap): Uint8Array {
  const candidateMask = buildDominantTargetMask(profile, map);
  if (profile.mapping.generatorVersion !== CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION) {
    return candidateMask;
  }
  const plateToTarget = invertTargetPlateMap(profile, map, candidateMask);
  return buildTargetReversibleCoreMask(profile, map, plateToTarget, candidateMask);
}

/**
 * Customer-facing compatibility name. Generated maps carry their source profile and therefore
 * return the validated core region. Hand-authored maps fall back to the raw ray-hit mask.
 */
export function buildTargetValidMask(map: TargetPlateMap): Uint8Array {
  return map.profile ? buildTargetCoreMask(map.profile, map) : buildTargetRayHitMask(map);
}

export function generateOpticalProfile(profile: OpticalProfile): GeneratedOpticalProfile {
  const targetToPlate = generateTargetPlateMap(profile);
  const reversible = profile.mapping.generatorVersion === CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION;
  const candidateMask = buildDominantTargetMask(profile, targetToPlate);
  const candidatePlateToTarget = invertTargetPlateMap(
    profile,
    targetToPlate,
    reversible ? candidateMask : undefined,
  );
  const rayHitMask = buildTargetRayHitMask(targetToPlate);
  const coreMask = reversible
    ? buildTargetReversibleCoreMask(profile, targetToPlate, candidatePlateToTarget, candidateMask)
    : candidateMask;
  // The first inverse pass establishes which target samples are reversible. A
  // second v3-only pass prevents the published inverse LUT from referring back
  // to samples outside that customer-visible core. Historical generators keep
  // their original single-pass bytes exactly.
  const plateToTarget = reversible
    ? invertTargetPlateMap(profile, targetToPlate, coreMask)
    : candidatePlateToTarget;
  const lutChecksum = fnv1a64(plateToTarget.targetUv) + fnv1a64(plateToTarget.validMask);
  return {
    profile: {
      ...profile,
      checksums: { ...profile.checksums, lut: lutChecksum }
    },
    targetToPlate,
    plateToTarget,
    targetRegion: {
      rayHitMask,
      coreMask,
      contour: buildTargetContourDocument(coreMask, targetToPlate.width, targetToPlate.height)
    }
  };
}

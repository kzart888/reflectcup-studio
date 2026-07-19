import { clamp } from "./math";
import type { RawRgbaImage, TargetPlateMap, Vec2 } from "./types";

export function sampleTargetPlateMap(map: TargetPlateMap, targetUv: Vec2): Vec2 | null {
  const x = clamp(targetUv[0], 0, 1) * (map.width - 1);
  const y = clamp(targetUv[1], 0, 1) * (map.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const a = map.samples[y0 * map.width + x0];
  const b = map.samples[y0 * map.width + x1];
  const c = map.samples[y1 * map.width + x0];
  const d = map.samples[y1 * map.width + x1];
  if (!a || !b || !c || !d) return null;
  const tx = x - x0;
  const ty = y - y0;
  const top: Vec2 = [
    a.plateUv[0] * (1 - tx) + b.plateUv[0] * tx,
    a.plateUv[1] * (1 - tx) + b.plateUv[1] * tx
  ];
  const bottom: Vec2 = [
    c.plateUv[0] * (1 - tx) + d.plateUv[0] * tx,
    c.plateUv[1] * (1 - tx) + d.plateUv[1] * tx
  ];
  return [top[0] * (1 - ty) + bottom[0] * ty, top[1] * (1 - ty) + bottom[1] * ty];
}

function sampleImage(image: RawRgbaImage, uv: Vec2): readonly [number, number, number, number] {
  // Plate UV describes physical texel edges: canonical pixels are authored at
  // (x + 0.5) / width. Convert back with the matching half-texel offset. This
  // differs intentionally from target/source UV, whose endpoints are pixel
  // centres on the desired-image lattice.
  const x = clamp(uv[0] * image.width - 0.5, 0, image.width - 1);
  const y = clamp(uv[1] * image.height - 0.5, 0, image.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const result = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel += 1) {
    const at = (px: number, py: number) => image.data[(py * image.width + px) * 4 + channel];
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    result[channel] = Math.round(top * (1 - ty) + bottom * ty);
  }
  return result as unknown as readonly [number, number, number, number];
}

/**
 * Replays the generated plate through the design-eye target map. This is an
 * optical closed-loop proof, not a beauty render of the full 3D scene.
 */
export function renderOpticalProof(
  plate: RawRgbaImage,
  targetToPlate: TargetPlateMap,
  size = 1024
): RawRgbaImage {
  if (!Number.isInteger(size) || size < 1 || size > 4096) {
    throw new Error("Proof output size must be an integer between 1 and 4096");
  }
  const output = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Target UV is defined on the sampled image lattice: u=0 and u=1 are
      // the centres of the first and last desired-image pixels. Using
      // half-texel UVs here introduces a systematic half-pixel proof shift.
      const targetUv: Vec2 = size === 1 ? [0.5, 0.5] : [x / (size - 1), y / (size - 1)];
      const plateUv = sampleTargetPlateMap(targetToPlate, targetUv);
      if (!plateUv) continue;
      const color = sampleImage(plate, plateUv);
      const offset = (y * size + x) * 4;
      output[offset] = color[0];
      output[offset + 1] = color[1];
      output[offset + 2] = color[2];
      output[offset + 3] = color[3];
    }
  }
  return { width: size, height: size, data: output };
}

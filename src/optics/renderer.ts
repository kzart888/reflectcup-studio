import { targetUvToSourceUv } from "./crop";
import { clamp } from "./math";
import { IDENTITY_STYLE, NO_FILL } from "./strategies";
import type { PlateTargetLut, RawRgbaImage, RenderPlateOptions, Rgba, Vec2 } from "./types";

function sampleSourceBilinear(source: RawRgbaImage, uv: Vec2): Rgba {
  const x = clamp(uv[0], 0, 1) * (source.width - 1);
  const y = clamp(uv[1], 0, 1) * (source.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const channel = (px: number, py: number, offset: number) => source.data[(py * source.width + px) * 4 + offset];
  const result = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const top = channel(x0, y0, c) * (1 - tx) + channel(x1, y0, c) * tx;
    const bottom = channel(x0, y1, c) * (1 - tx) + channel(x1, y1, c) * tx;
    result[c] = Math.round(top * (1 - ty) + bottom * ty);
  }
  return result as unknown as Rgba;
}

export function samplePlateTargetLut(lut: PlateTargetLut, plateUv: Vec2): Vec2 | null {
  const centerX = clamp(Math.round(plateUv[0] * lut.width - 0.5), 0, lut.width - 1);
  const centerY = clamp(Math.round(plateUv[1] * lut.height - 0.5), 0, lut.height - 1);
  if (lut.validMask[centerY * lut.width + centerX] === 0) return null;

  const x = clamp(plateUv[0] * lut.width - 0.5, 0, lut.width - 1);
  const y = clamp(plateUv[1] * lut.height - 0.5, 0, lut.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(lut.width - 1, x0 + 1);
  const y1 = Math.min(lut.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const neighbours = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty]
  ] as const;
  let u = 0;
  let v = 0;
  let weight = 0;
  for (const [px, py, contribution] of neighbours) {
    const pixel = py * lut.width + px;
    if (lut.validMask[pixel] === 0 || contribution === 0) continue;
    u += lut.targetUv[pixel * 2] * contribution;
    v += lut.targetUv[pixel * 2 + 1] * contribution;
    weight += contribution;
  }
  return weight > 0 ? [u / weight, v / weight] : null;
}

export function renderCanonicalPlate(options: RenderPlateOptions): RawRgbaImage {
  const { size, source, lut, crop } = options;
  if (!Number.isInteger(size) || size < 1 || size > 8192) {
    throw new Error("Plate output size must be an integer between 1 and 8192");
  }
  if (source.data.length !== source.width * source.height * 4) {
    throw new Error("Source RGBA buffer length does not match its dimensions");
  }
  const output = new Uint8Array(size * size * 4);
  const style = options.style ?? IDENTITY_STYLE;
  const fill = options.fill ?? NO_FILL;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const plateUv: Vec2 = [(x + 0.5) / size, (y + 0.5) / size];
      const targetUv = samplePlateTargetLut(lut, plateUv);
      const sample = targetUv
        ? style.transform(sampleSourceBilinear(
          source,
          targetUvToSourceUv(targetUv, crop, source.width, source.height)
        ))
        : fill.fill(plateUv);
      if (!sample) continue;
      const offset = (y * size + x) * 4;
      output[offset] = clamp(Math.round(sample[0]), 0, 255);
      output[offset + 1] = clamp(Math.round(sample[1]), 0, 255);
      output[offset + 2] = clamp(Math.round(sample[2]), 0, 255);
      output[offset + 3] = clamp(Math.round(sample[3]), 0, 255);
    }
  }
  return { width: size, height: size, data: output };
}

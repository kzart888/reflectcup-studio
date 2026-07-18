import type { RawRgbaImage } from "@/optics/types";

export type PixelBounds = Readonly<{ x0: number; y0: number; x1: number; y1: number }>;

export function createOutput(input: RawRgbaImage): Uint8Array {
  return new Uint8Array(input.width * input.height * 4);
}

export function sourceAlpha(input: RawRgbaImage, x: number, y: number): number {
  return input.data[(y * input.width + x) * 4 + 3];
}

export function writeColourPreservingAlpha(
  input: RawRgbaImage,
  output: Uint8Array,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number
): void {
  const offset = (y * input.width + x) * 4;
  const alpha = input.data[offset + 3];
  output[offset] = alpha === 0 ? 0 : Math.max(0, Math.min(255, Math.round(red)));
  output[offset + 1] = alpha === 0 ? 0 : Math.max(0, Math.min(255, Math.round(green)));
  output[offset + 2] = alpha === 0 ? 0 : Math.max(0, Math.min(255, Math.round(blue)));
  output[offset + 3] = alpha;
}

export function luminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function averageColour(input: RawRgbaImage, bounds: PixelBounds): readonly [number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const offset = (y * input.width + x) * 4;
      const alpha = input.data[offset + 3] / 255;
      red += input.data[offset] * alpha;
      green += input.data[offset + 1] * alpha;
      blue += input.data[offset + 2] * alpha;
      weight += alpha;
    }
  }
  return weight === 0 ? [0, 0, 0] : [red / weight, green / weight, blue / weight];
}

export function averageLuminanceOnWhite(input: RawRgbaImage, bounds: PixelBounds): number {
  let total = 0;
  let count = 0;
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const offset = (y * input.width + x) * 4;
      const alpha = input.data[offset + 3] / 255;
      total += luminance(input.data[offset], input.data[offset + 1], input.data[offset + 2]) * alpha
        + 255 * (1 - alpha);
      count += 1;
    }
  }
  return count === 0 ? 255 : total / count;
}

export function blockBounds(
  column: number,
  row: number,
  pitch: number,
  width: number,
  height: number
): PixelBounds {
  return {
    x0: column * pitch,
    y0: row * pitch,
    x1: Math.min(width, (column + 1) * pitch),
    y1: Math.min(height, (row + 1) * pitch)
  };
}

export function fillBoundsPreservingAlpha(
  input: RawRgbaImage,
  output: Uint8Array,
  bounds: PixelBounds,
  red: number,
  green: number,
  blue: number
): void {
  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      writeColourPreservingAlpha(input, output, x, y, red, green, blue);
    }
  }
}

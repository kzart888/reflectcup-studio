import {
  assertRawRgbaImage,
  defineStyleProvider,
  millimetresToPixels,
  requirePhysicalParameter
} from "./core";
import {
  averageColour,
  blockBounds,
  createOutput,
  fillBoundsPreservingAlpha,
  writeColourPreservingAlpha
} from "./pixels";
import type { StyleProcessOptions, StyleProvider } from "./types";

export const SQUARE_MOSAIC_PROVIDER: StyleProvider = defineStyleProvider({
  id: "square-mosaic",
  version: 2,
  label: "Square mosaic",
  parameters: [
    { key: "cellSizeMm", label: "Cell size", unit: "mm", defaultValue: 4.8, minimum: 0.4, maximum: 24 }
  ],
  process(input, options) {
    assertRawRgbaImage(input);
    const cellSizeMm = requirePhysicalParameter(options, "cellSizeMm", "feature");
    const cell = millimetresToPixels(input, options.physical, cellSizeMm);
    const output = createOutput(input);
    const columns = Math.ceil(input.width / cell);
    const rows = Math.ceil(input.height / cell);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const bounds = blockBounds(column, row, cell, input.width, input.height);
        const [red, green, blue] = averageColour(input, bounds);
        fillBoundsPreservingAlpha(input, output, bounds, red, green, blue);
      }
    }
    return Promise.resolve({ width: input.width, height: input.height, data: output });
  }
});

type HexAccumulator = { red: number; green: number; blue: number; weight: number };

function nearestHexKey(x: number, y: number, radius: number): string {
  const verticalStep = radius * 1.5;
  const horizontalStep = Math.sqrt(3) * radius;
  const estimatedRow = Math.round((y - radius) / verticalStep);
  let bestKey = "0:0";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let row = estimatedRow - 1; row <= estimatedRow + 1; row += 1) {
    const offset = Math.abs(row % 2) === 1 ? horizontalStep / 2 : 0;
    const estimatedColumn = Math.round((x - radius - offset) / horizontalStep);
    for (let column = estimatedColumn - 1; column <= estimatedColumn + 1; column += 1) {
      const centerX = radius + offset + column * horizontalStep;
      const centerY = radius + row * verticalStep;
      const distance = (x - centerX) ** 2 + (y - centerY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = `${row}:${column}`;
      }
    }
  }
  return bestKey;
}

export const HEX_MOSAIC_PROVIDER: StyleProvider = defineStyleProvider({
  id: "hex-mosaic",
  version: 2,
  label: "Hex mosaic",
  parameters: [
    { key: "cellDiameterMm", label: "Cell diameter", unit: "mm", defaultValue: 5.4, minimum: 0.4, maximum: 24 }
  ],
  process(input, options: StyleProcessOptions) {
    assertRawRgbaImage(input);
    const diameterMm = requirePhysicalParameter(options, "cellDiameterMm", "feature");
    const radius = Math.max(1, millimetresToPixels(input, options.physical, diameterMm) / 2);
    const keys = new Array<string>(input.width * input.height);
    const accumulators = new Map<string, HexAccumulator>();

    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const pixel = y * input.width + x;
        const offset = pixel * 4;
        const key = nearestHexKey(x + 0.5, y + 0.5, radius);
        keys[pixel] = key;
        const alpha = input.data[offset + 3] / 255;
        const accumulator = accumulators.get(key) ?? { red: 0, green: 0, blue: 0, weight: 0 };
        accumulator.red += input.data[offset] * alpha;
        accumulator.green += input.data[offset + 1] * alpha;
        accumulator.blue += input.data[offset + 2] * alpha;
        accumulator.weight += alpha;
        accumulators.set(key, accumulator);
      }
    }

    const output = createOutput(input);
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const accumulator = accumulators.get(keys[y * input.width + x]);
        const weight = accumulator?.weight ?? 0;
        writeColourPreservingAlpha(
          input,
          output,
          x,
          y,
          weight === 0 ? 0 : (accumulator?.red ?? 0) / weight,
          weight === 0 ? 0 : (accumulator?.green ?? 0) / weight,
          weight === 0 ? 0 : (accumulator?.blue ?? 0) / weight
        );
      }
    }
    return Promise.resolve({ width: input.width, height: input.height, data: output });
  }
});

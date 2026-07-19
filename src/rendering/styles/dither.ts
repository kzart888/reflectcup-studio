import type { RawRgbaImage } from "@/optics/types";
import {
  assertRawRgbaImage,
  defineStyleProvider,
  millimetresToPixels,
  requirePhysicalParameter
} from "./core";
import {
  averageLuminanceOnWhite,
  blockBounds,
  createOutput,
  fillBoundsPreservingAlpha
} from "./pixels";
import type { StyleProvider } from "./types";

const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
] as const;

function expandBayer(source: readonly number[], size: number): number[] {
  const result = new Array<number>(size * size * 4);
  const offsets = [0, 2, 3, 1] as const;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = source[y * size + x] * 4;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const outputSize = size * 2;
          result[(y * 2 + dy) * outputSize + x * 2 + dx] = value + offsets[dy * 2 + dx];
        }
      }
    }
  }
  return result;
}

const BAYER_8 = expandBayer(BAYER_4, 4);

function cellLuminances(input: RawRgbaImage, pitch: number): {
  values: Float64Array;
  columns: number;
  rows: number;
} {
  const columns = Math.ceil(input.width / pitch);
  const rows = Math.ceil(input.height / pitch);
  const values = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      values[row * columns + column] = averageLuminanceOnWhite(
        input,
        blockBounds(column, row, pitch, input.width, input.height)
      );
    }
  }
  return { values, columns, rows };
}

function renderCells(
  input: RawRgbaImage,
  pitch: number,
  columns: number,
  rows: number,
  values: Uint8Array
): RawRgbaImage {
  const output = createOutput(input);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column];
      fillBoundsPreservingAlpha(
        input,
        output,
        blockBounds(column, row, pitch, input.width, input.height),
        value,
        value,
        value
      );
    }
  }
  return { width: input.width, height: input.height, data: output };
}

export const BAYER_DITHER_PROVIDER: StyleProvider = defineStyleProvider({
  id: "bayer-dither",
  version: 2,
  label: "Bayer ordered dither",
  parameters: [
    { key: "matrixSize", label: "Matrix size", unit: "integer", defaultValue: 4, minimum: 4, maximum: 8 },
    { key: "samplePitchMm", label: "Sample pitch", unit: "mm", defaultValue: 1.2, minimum: 0.6, maximum: 8 }
  ],
  process(input, options) {
    assertRawRgbaImage(input);
    const matrixSize = options.params.matrixSize;
    if (matrixSize !== 4 && matrixSize !== 8) throw new Error("matrixSize must be 4 or 8");
    const samplePitchMm = requirePhysicalParameter(options, "samplePitchMm", "pitch");
    const pitch = millimetresToPixels(input, options.physical, samplePitchMm);
    const cells = cellLuminances(input, pitch);
    const matrix = matrixSize === 4 ? BAYER_4 : BAYER_8;
    const values = new Uint8Array(cells.values.length);
    for (let row = 0; row < cells.rows; row += 1) {
      for (let column = 0; column < cells.columns; column += 1) {
        const thresholdIndex = (row % matrixSize) * matrixSize + column % matrixSize;
        const threshold = (matrix[thresholdIndex] + 0.5) * 255 / (matrixSize * matrixSize);
        values[row * cells.columns + column] = cells.values[row * cells.columns + column] < threshold ? 0 : 255;
      }
    }
    return Promise.resolve(renderCells(input, pitch, cells.columns, cells.rows, values));
  }
});

type DiffusionTap = readonly [dx: number, dy: number, weight: number];

const FLOYD_STEINBERG_TAPS: readonly DiffusionTap[] = [
  [1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]
];

const STUCKI_TAPS: readonly DiffusionTap[] = [
  [1, 0, 8 / 42], [2, 0, 4 / 42],
  [-2, 1, 2 / 42], [-1, 1, 4 / 42], [0, 1, 8 / 42], [1, 1, 4 / 42], [2, 1, 2 / 42],
  [-2, 2, 1 / 42], [-1, 2, 2 / 42], [0, 2, 4 / 42], [1, 2, 2 / 42], [2, 2, 1 / 42]
];

export const ERROR_DIFFUSION_PROVIDER: StyleProvider = defineStyleProvider({
  id: "error-diffusion",
  version: 2,
  label: "Serpentine error diffusion",
  parameters: [
    { key: "kernel", label: "Kernel (1=Floyd–Steinberg, 2=Stucki)", unit: "integer", defaultValue: 1, minimum: 1, maximum: 2 },
    { key: "samplePitchMm", label: "Sample pitch", unit: "mm", defaultValue: 1.2, minimum: 0.6, maximum: 8 }
  ],
  process(input, options) {
    assertRawRgbaImage(input);
    const kernel = options.params.kernel;
    if (kernel !== 1 && kernel !== 2) throw new Error("kernel must be 1 (Floyd–Steinberg) or 2 (Stucki)");
    const samplePitchMm = requirePhysicalParameter(options, "samplePitchMm", "pitch");
    const pitch = millimetresToPixels(input, options.physical, samplePitchMm);
    const cells = cellLuminances(input, pitch);
    const errors = new Float64Array(cells.values.length);
    const values = new Uint8Array(cells.values.length);
    const taps = kernel === 1 ? FLOYD_STEINBERG_TAPS : STUCKI_TAPS;

    for (let row = 0; row < cells.rows; row += 1) {
      const reverse = row % 2 === 1;
      for (let step = 0; step < cells.columns; step += 1) {
        const column = reverse ? cells.columns - 1 - step : step;
        const pixel = row * cells.columns + column;
        // Keep the accumulated value unbounded until palette selection. Early
        // clipping discards quantisation debt and biases long tonal ramps.
        const adjusted = cells.values[pixel] + errors[pixel];
        const quantized = adjusted < 128 ? 0 : 255;
        values[pixel] = quantized;
        const error = adjusted - quantized;
        for (const [rawDx, dy, weight] of taps) {
          const dx = reverse ? -rawDx : rawDx;
          const targetX = column + dx;
          const targetY = row + dy;
          if (targetX < 0 || targetX >= cells.columns || targetY < 0 || targetY >= cells.rows) continue;
          errors[targetY * cells.columns + targetX] += error * weight;
        }
      }
    }
    return Promise.resolve(renderCells(input, pitch, cells.columns, cells.rows, values));
  }
});

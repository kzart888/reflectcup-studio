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
  writeColourPreservingAlpha
} from "./pixels";
import type { StyleProvider } from "./types";

function circleAreaInsideSquare(radius: number, pitch: number): number {
  const half = pitch / 2;
  if (radius <= half) return Math.PI * radius * radius;
  if (radius >= half * Math.SQRT2) return pitch * pitch;
  const cap = radius * radius * Math.acos(half / radius)
    - half * Math.sqrt(radius * radius - half * half);
  return Math.PI * radius * radius - 4 * cap;
}

/**
 * Invert the periodic circular-dot coverage of one square halftone cell.
 * Unlike diameter = pitch * sqrt(tone), this reaches both paper white and
 * solid black without compressing the midtones. Dots naturally merge above
 * roughly 78.5% coverage, as conventional clustered-dot screens do.
 */
function diameterForCoverage(coverage: number, pitch: number): number {
  if (coverage <= 0) return 0;
  if (coverage >= 1) return pitch * Math.SQRT2;
  const targetArea = coverage * pitch * pitch;
  let low = 0;
  let high = pitch / Math.SQRT2;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (low + high) / 2;
    if (circleAreaInsideSquare(middle, pitch) < targetArea) low = middle;
    else high = middle;
  }
  return high * 2;
}

export const CLUSTERED_DOT_HALFTONE_PROVIDER: StyleProvider = defineStyleProvider({
  id: "clustered-dot-halftone",
  version: 2,
  label: "Clustered-dot B/W halftone",
  parameters: [
    { key: "pitchMm", label: "Grid pitch", unit: "mm", defaultValue: 2.4, minimum: 0.6, maximum: 12 },
    { key: "minDotDiameterMm", label: "Minimum printable dot", unit: "mm", defaultValue: 0.4, minimum: 0.4, maximum: 6 },
    { key: "maxDotDiameterMm", label: "Maximum dot diameter", unit: "mm", defaultValue: 2.2, minimum: 0.4, maximum: 12 },
    { key: "gamma", label: "Tone gamma", unit: "ratio", defaultValue: 1, minimum: 0.25, maximum: 4 }
  ],
  process(input, options) {
    assertRawRgbaImage(input);
    const pitchMm = requirePhysicalParameter(options, "pitchMm", "pitch");
    const minimumDotMm = requirePhysicalParameter(options, "minDotDiameterMm", "feature");
    const maximumDotMm = requirePhysicalParameter(options, "maxDotDiameterMm", "feature");
    if (minimumDotMm > maximumDotMm) throw new Error("minDotDiameterMm cannot exceed maxDotDiameterMm");
    if (maximumDotMm > pitchMm * Math.SQRT2 + 1e-9) {
      throw new Error("maxDotDiameterMm cannot exceed pitchMm * sqrt(2)");
    }
    const gamma = options.params.gamma;
    const pitch = millimetresToPixels(input, options.physical, pitchMm);
    const minimumDiameter = millimetresToPixels(input, options.physical, minimumDotMm);
    const maximumDiameter = Math.min(
      Math.ceil(pitch * Math.SQRT2),
      millimetresToPixels(input, options.physical, maximumDotMm)
    );
    const output = createOutput(input);
    const columns = Math.ceil(input.width / pitch);
    const rows = Math.ceil(input.height / pitch);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const bounds = blockBounds(column, row, pitch, input.width, input.height);
        const average = averageLuminanceOnWhite(input, bounds);
        const darkness = Math.pow(1 - average / 255, 1 / gamma);
        const rawDiameter = Math.min(maximumDiameter, diameterForCoverage(darkness, pitch));
        const diameter = rawDiameter >= minimumDiameter ? rawDiameter : 0;
        const radius = diameter / 2;
        const centerX = (bounds.x0 + bounds.x1) / 2;
        const centerY = (bounds.y0 + bounds.y1) / 2;
        for (let y = bounds.y0; y < bounds.y1; y += 1) {
          for (let x = bounds.x0; x < bounds.x1; x += 1) {
            const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
            const coverage = Math.max(0, Math.min(1, radius + 0.5 - distance));
            const value = 255 * (1 - coverage);
            writeColourPreservingAlpha(input, output, x, y, value, value, value);
          }
        }
      }
    }
    return Promise.resolve({ width: input.width, height: input.height, data: output });
  }
});

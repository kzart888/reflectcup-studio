import { createHash } from "node:crypto";

import sharp from "sharp";

import type { RawRgbaImage } from "@/optics/types";

import type { AITargetEncodingMode } from "./records";

export const AI_TARGET_PREPARATION_VERSION = 1 as const;

export type AITargetPreparationOptions = Readonly<{
  maxDimension?: number;
  tonalBands?: number;
  smoothingSigma?: number;
  contourThreshold?: number;
  contourSoftness?: number;
  contourWidthPx?: 1 | 3 | 5;
  hybridContourWeight?: number;
}>;

export type NormalizedAITargetPreparationOptions = Readonly<{
  maxDimension: number;
  tonalBands: number;
  smoothingSigma: number;
  contourThreshold: number;
  contourSoftness: number;
  contourWidthPx: 1 | 3 | 5;
  hybridContourWeight: number;
}>;

export type AITargetPreparationRecipe = Readonly<{
  schemaVersion: 1;
  providerId: "reflectcup-target-preparation";
  version: typeof AI_TARGET_PREPARATION_VERSION;
  mode: AITargetEncodingMode;
  options: NormalizedAITargetPreparationOptions;
}>;

export type AIPreparedTarget = Readonly<{
  /** Returns a fresh copy; callers can never mutate the authoritative bytes. */
  image: RawRgbaImage;
  copyImage(): RawRgbaImage;
  recipe: AITargetPreparationRecipe;
  sourceSha256: string;
  targetSha256: string;
}>;

const DEFAULT_OPTIONS: NormalizedAITargetPreparationOptions = Object.freeze({
  maxDimension: 768,
  tonalBands: 5,
  smoothingSigma: 1.2,
  contourThreshold: 0.18,
  contourSoftness: 0.08,
  contourWidthPx: 1,
  hybridContourWeight: 0.35
});

function assertRawRgbaImage(image: RawRgbaImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) {
    throw new Error("AI target input dimensions must be positive integers");
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error("AI target input RGBA buffer length does not match its dimensions");
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedNumber(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function contourWidth(value: number): 1 | 3 | 5 {
  if (value !== 1 && value !== 3 && value !== 5) {
    throw new Error("contourWidthPx must be one of 1, 3 or 5");
  }
  return value;
}

export function normalizeAITargetPreparationOptions(
  options: AITargetPreparationOptions = {}
): NormalizedAITargetPreparationOptions {
  return Object.freeze({
    maxDimension: boundedInteger(options.maxDimension ?? DEFAULT_OPTIONS.maxDimension, 64, 2_048, "maxDimension"),
    tonalBands: boundedInteger(options.tonalBands ?? DEFAULT_OPTIONS.tonalBands, 4, 6, "tonalBands"),
    smoothingSigma: boundedNumber(options.smoothingSigma ?? DEFAULT_OPTIONS.smoothingSigma, 0.3, 10, "smoothingSigma"),
    contourThreshold: boundedNumber(options.contourThreshold ?? DEFAULT_OPTIONS.contourThreshold, 0.01, 0.95, "contourThreshold"),
    contourSoftness: boundedNumber(options.contourSoftness ?? DEFAULT_OPTIONS.contourSoftness, 0.01, 0.5, "contourSoftness"),
    contourWidthPx: contourWidth(options.contourWidthPx ?? DEFAULT_OPTIONS.contourWidthPx),
    hybridContourWeight: boundedNumber(
      options.hybridContourWeight ?? DEFAULT_OPTIONS.hybridContourWeight,
      0,
      1,
      "hybridContourWeight"
    )
  });
}

function imageSha256(image: RawRgbaImage): string {
  const dimensions = Buffer.allocUnsafe(8);
  dimensions.writeUInt32LE(image.width, 0);
  dimensions.writeUInt32LE(image.height, 4);
  return createHash("sha256").update(dimensions).update(image.data).digest("hex");
}

function quantizeTonal(grey: Uint8Array, bands: number): Uint8Array {
  const result = new Uint8Array(grey.length);
  const maximumBand = bands - 1;
  for (let index = 0; index < grey.length; index += 1) {
    result[index] = Math.round(Math.round((grey[index] / 255) * maximumBand) * 255 / maximumBand);
  }
  return result;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function readClamped(pixels: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  return pixels[py * width + px];
}

function buildContour(
  grey: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  softness: number,
  lineWidth: number
): Uint8Array {
  const strength = new Float32Array(grey.length);
  const edgeStart = Math.max(0, threshold - softness * 0.5);
  const edgeEnd = Math.min(1, threshold + softness * 0.5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = readClamped(grey, width, height, x - 1, y - 1);
      const b = readClamped(grey, width, height, x, y - 1);
      const c = readClamped(grey, width, height, x + 1, y - 1);
      const d = readClamped(grey, width, height, x - 1, y);
      const f = readClamped(grey, width, height, x + 1, y);
      const g = readClamped(grey, width, height, x - 1, y + 1);
      const h = readClamped(grey, width, height, x, y + 1);
      const i = readClamped(grey, width, height, x + 1, y + 1);
      const gx = -a + c - 2 * d + 2 * f - g + i;
      const gy = -a - 2 * b - c + g + 2 * h + i;
      const normalized = Math.min(1, Math.hypot(gx, gy) / (4 * 255 * Math.SQRT2));
      strength[y * width + x] = smoothstep(edgeStart, edgeEnd, normalized);
    }
  }

  const result = new Uint8Array(grey.length);
  const firstOffset = -Math.floor((lineWidth - 1) / 2);
  const lastOffset = Math.ceil((lineWidth - 1) / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0;
      for (let offsetY = firstOffset; offsetY <= lastOffset; offsetY += 1) {
        for (let offsetX = firstOffset; offsetX <= lastOffset; offsetX += 1) {
          const px = Math.max(0, Math.min(width - 1, x + offsetX));
          const py = Math.max(0, Math.min(height - 1, y + offsetY));
          maximum = Math.max(maximum, strength[py * width + px]);
        }
      }
      result[y * width + x] = Math.round(255 * (1 - maximum));
    }
  }
  return result;
}

function toOpaqueRgba(grey: Uint8Array, width: number, height: number): RawRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < grey.length; index += 1) {
    const offset = index * 4;
    data[offset] = grey[index];
    data[offset + 1] = grey[index];
    data[offset + 2] = grey[index];
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

export async function prepareAITarget(
  input: RawRgbaImage,
  mode: AITargetEncodingMode,
  suppliedOptions: AITargetPreparationOptions = {}
): Promise<AIPreparedTarget> {
  assertRawRgbaImage(input);
  // Capture dimensions and bytes before the first asynchronous boundary. Sharp
  // and both hashes operate on this private snapshot, not caller-owned memory.
  const sourceSnapshot: RawRgbaImage = {
    width: input.width,
    height: input.height,
    data: Uint8Array.from(input.data)
  };
  const sourceSha256 = imageSha256(sourceSnapshot);
  if (!(["tonal", "contour", "hybrid"] as const).includes(mode)) {
    throw new Error(`Unsupported AI target mode: ${String(mode)}`);
  }
  const options = normalizeAITargetPreparationOptions(suppliedOptions);
  const { data, info } = await sharp(sourceSnapshot.data, {
    raw: { width: sourceSnapshot.width, height: sourceSnapshot.height, channels: 4 }
  })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3"
    })
    .greyscale()
    .blur(options.smoothingSigma)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grey = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const tonal = quantizeTonal(grey, options.tonalBands);
  const contour = mode === "tonal"
    ? undefined
    : buildContour(
      grey,
      info.width,
      info.height,
      options.contourThreshold,
      options.contourSoftness,
      options.contourWidthPx
    );
  let prepared = tonal;
  if (mode === "contour") prepared = contour!;
  if (mode === "hybrid") {
    prepared = new Uint8Array(tonal.length);
    for (let index = 0; index < tonal.length; index += 1) {
      prepared[index] = Math.round(
        tonal[index] * (1 - options.hybridContourWeight)
        + contour![index] * options.hybridContourWeight
      );
    }
  }

  const authoritativeImage = toOpaqueRgba(prepared, info.width, info.height);
  const targetSha256 = imageSha256(authoritativeImage);
  const copyImage = (): RawRgbaImage => ({
    width: authoritativeImage.width,
    height: authoritativeImage.height,
    data: Uint8Array.from(authoritativeImage.data)
  });
  const result = {
    get image(): RawRgbaImage {
      return copyImage();
    },
    copyImage,
    recipe: Object.freeze({
      schemaVersion: 1,
      providerId: "reflectcup-target-preparation",
      version: AI_TARGET_PREPARATION_VERSION,
      mode,
      options
    }),
    sourceSha256,
    targetSha256
  } satisfies AIPreparedTarget;
  return Object.freeze(result);
}

import sharp from "sharp";
import { MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { renderCanonicalPlate } from "../renderer";
import type { RawRgbaImage, RenderPlateOptions } from "../types";

export async function decodeSourceImage(
  encoded: Buffer,
  limits: { maxBytes?: number; maxPixels?: number } = {}
): Promise<RawRgbaImage> {
  const maxBytes = limits.maxBytes ?? MAX_UPLOAD_BYTES;
  const maxPixels = limits.maxPixels ?? MAX_INPUT_PIXELS;
  if (encoded.byteLength === 0 || encoded.byteLength > maxBytes) {
    throw new Error(`Encoded image must be between 1 and ${maxBytes} bytes`);
  }
  const pipeline = sharp(encoded, {
    failOn: "warning",
    limitInputPixels: maxPixels,
    sequentialRead: true
  }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels) {
    throw new Error(`Decoded image exceeds the ${maxPixels} pixel limit`);
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("Only JPEG, PNG and WebP inputs are supported");
  }
  const { data, info } = await pipeline
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export async function encodeRgbaPng(image: RawRgbaImage): Promise<Buffer> {
  return sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 }
  }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

export async function renderCanonicalPlatePng(options: RenderPlateOptions): Promise<Buffer> {
  return encodeRgbaPng(renderCanonicalPlate(options));
}

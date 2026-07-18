import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeSourceImage, encodeRgbaPng } from "@/optics/server/image";

describe("server image boundary", () => {
  it("round-trips supported images as metadata-free RGBA PNG data", async () => {
    const encoded = await encodeRgbaPng({
      width: 2,
      height: 1,
      data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128])
    });
    const decoded = await decodeSourceImage(encoded);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.data).toHaveLength(8);
    const metadata = await sharp(encoded).metadata();
    expect(metadata.format).toBe("png");
  });

  it("enforces encoded byte and decoded pixel limits before rendering", async () => {
    const encoded = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#ffffff" }
    }).png().toBuffer();
    await expect(decodeSourceImage(encoded, { maxBytes: encoded.byteLength - 1 })).rejects.toThrow(/between 1/);
    await expect(decodeSourceImage(encoded, { maxPixels: 4 })).rejects.toThrow();
  });

  it("rejects formats outside the JPEG, PNG and WebP MVP contract", async () => {
    const encoded = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#ffffff" }
    }).gif().toBuffer();
    await expect(decodeSourceImage(encoded)).rejects.toThrow(/JPEG, PNG and WebP/);
  });
});

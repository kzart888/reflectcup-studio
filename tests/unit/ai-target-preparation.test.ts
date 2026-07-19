import { describe, expect, it } from "vitest";

import {
  normalizeAITargetPreparationOptions,
  prepareAITarget
} from "@/domains/ai/target-preparation";
import type { RawRgbaImage } from "@/optics/types";

function fixture(width = 96, height = 64): RawRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = x >= width / 3 && x < width * 2 / 3 && y >= height / 4 && y < height * 3 / 4;
      data[offset] = inside ? 20 : 235;
      data[offset + 1] = inside ? 40 : 210;
      data[offset + 2] = inside ? 60 : 180;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function greyValues(image: RawRgbaImage): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < image.data.length; offset += 4) {
    expect(image.data[offset]).toBe(image.data[offset + 1]);
    expect(image.data[offset]).toBe(image.data[offset + 2]);
    expect(image.data[offset + 3]).toBe(255);
    values.push(image.data[offset]);
  }
  return values;
}

describe("AI target preparation", () => {
  it("produces a deterministic, bounded tonal target without mutating the source", async () => {
    const source = fixture(160, 80);
    const before = Uint8Array.from(source.data);
    const options = { maxDimension: 64, tonalBands: 4, smoothingSigma: 0.6 };
    const first = await prepareAITarget(source, "tonal", options);
    const second = await prepareAITarget(source, "tonal", options);

    expect(first.image).toEqual(second.image);
    expect(first.sourceSha256).toBe(second.sourceSha256);
    expect(first.targetSha256).toBe(second.targetSha256);
    expect(first.image).toMatchObject({ width: 64, height: 32 });
    expect(source.data).toEqual(before);
    expect(new Set(greyValues(first.image)).size).toBeLessThanOrEqual(4);
    expect(first.recipe).toMatchObject({
      schemaVersion: 1,
      providerId: "reflectcup-target-preparation",
      version: 1,
      mode: "tonal",
      options: { maxDimension: 64, tonalBands: 4 }
    });
  });

  it("snapshots caller bytes before async work and never exposes authoritative output memory", async () => {
    const source = fixture(160, 80);
    const baseline = await prepareAITarget(fixture(160, 80), "tonal", {
      maxDimension: 64,
      tonalBands: 4,
      smoothingSigma: 0.6
    });
    const pending = prepareAITarget(source, "tonal", {
      maxDimension: 64,
      tonalBands: 4,
      smoothingSigma: 0.6
    });
    source.data.fill(0);
    source.width = 1;
    source.height = 1;
    const raced = await pending;
    expect(raced.sourceSha256).toBe(baseline.sourceSha256);
    expect(raced.targetSha256).toBe(baseline.targetSha256);
    expect(raced.image).toEqual(baseline.image);

    const callerCopy = raced.image;
    callerCopy.data.fill(17);
    expect(raced.image).toEqual(baseline.image);
    expect(raced.copyImage()).toEqual(baseline.image);
    expect(raced.image).not.toBe(raced.image);
    expect(raced.image.data).not.toBe(raced.image.data);
  });

  it("extracts a dark contour against a light field", async () => {
    const options = {
      maxDimension: 96,
      smoothingSigma: 0.3,
      contourThreshold: 0.08,
      contourSoftness: 0.04
    };
    const result = await prepareAITarget(fixture(), "contour", options);
    const values = greyValues(result.image);
    expect(Math.min(...values)).toBeLessThan(32);
    expect(Math.max(...values)).toBeGreaterThan(250);
    expect(values.filter((value) => value < 128).length).toBeGreaterThan(20);
    const wider = await prepareAITarget(fixture(), "contour", { ...options, contourWidthPx: 3 });
    expect(greyValues(wider.image).filter((value) => value < 128).length)
      .toBeGreaterThan(values.filter((value) => value < 128).length);
  });

  it("combines tonal structure with contours in hybrid mode", async () => {
    const options = {
      maxDimension: 96,
      smoothingSigma: 0.3,
      contourThreshold: 0.08,
      contourSoftness: 0.04,
      hybridContourWeight: 0.35
    };
    const source = fixture();
    const [tonal, contour, hybrid] = await Promise.all([
      prepareAITarget(source, "tonal", options),
      prepareAITarget(source, "contour", options),
      prepareAITarget(source, "hybrid", options)
    ]);
    expect(hybrid.image.data).not.toEqual(tonal.image.data);
    expect(hybrid.image.data).not.toEqual(contour.image.data);
    const edgeOffset = (source.height / 2 * source.width + source.width / 3) * 4;
    expect(hybrid.image.data[edgeOffset]).toBeLessThan(tonal.image.data[edgeOffset]);
  });

  it("composites transparency over white instead of leaking alpha into the condition", async () => {
    const source: RawRgbaImage = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) };
    const result = await prepareAITarget(source, "tonal", { maxDimension: 64, smoothingSigma: 0.3 });
    expect(new Set(greyValues(result.image))).toEqual(new Set([255]));
  });

  it("rejects malformed images, modes and out-of-contract parameters", async () => {
    await expect(prepareAITarget({ width: 2, height: 2, data: new Uint8Array(3) }, "tonal"))
      .rejects.toThrow("buffer length");
    await expect(prepareAITarget(fixture(), "other" as "tonal")).rejects.toThrow("Unsupported AI target mode");
    expect(() => normalizeAITargetPreparationOptions({ tonalBands: 3 })).toThrow("tonalBands");
    expect(() => normalizeAITargetPreparationOptions({ maxDimension: 2_049 })).toThrow("maxDimension");
    expect(() => normalizeAITargetPreparationOptions({ hybridContourWeight: Number.NaN })).toThrow("hybridContourWeight");
    expect(normalizeAITargetPreparationOptions({ contourWidthPx: 1 }).contourWidthPx).toBe(1);
    expect(normalizeAITargetPreparationOptions({ contourWidthPx: 3 }).contourWidthPx).toBe(3);
    expect(normalizeAITargetPreparationOptions({ contourWidthPx: 5 }).contourWidthPx).toBe(5);
    expect(() => normalizeAITargetPreparationOptions({ contourWidthPx: 2 as 1 })).toThrow("one of 1, 3 or 5");
  });
});

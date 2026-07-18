import { describe, expect, it } from "vitest";
import type { RawRgbaImage } from "@/optics/types";
import {
  BAYER_DITHER_PROVIDER,
  executeStyle,
  SQUARE_MOSAIC_PROVIDER,
  serializeStyleRecipe,
  STYLE_PROVIDER_REGISTRY,
  type StyleProcessOptions
} from "@/rendering/styles";

const PHYSICAL = Object.freeze({
  widthMm: 16,
  heightMm: 12,
  minFeatureMm: 0.4,
  minPitchMm: 0.6
});

function fixture(width = 32, height = 24): RawRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 17 + y * 3) % 256;
      data[offset + 1] = (x * 5 + y * 19) % 256;
      data[offset + 2] = (x * 11 + y * 7) % 256;
      data[offset + 3] = (x * 23 + y * 13) % 256;
    }
  }
  return { width, height, data };
}

function options(overrides: Partial<StyleProcessOptions> = {}): StyleProcessOptions {
  return {
    params: {},
    seed: 20260718,
    domain: "target",
    physical: PHYSICAL,
    ...overrides
  };
}

describe.each(STYLE_PROVIDER_REGISTRY)("$id provider", (provider) => {
  it("is deterministic, dimension preserving and non-mutating", async () => {
    const input = fixture();
    const before = Uint8Array.from(input.data);
    const first = await executeStyle(provider, input, options());
    const second = await executeStyle(provider, input, options());

    expect(first.image.width).toBe(input.width);
    expect(first.image.height).toBe(input.height);
    expect(first.image.data).toEqual(second.image.data);
    expect(input.data).toEqual(before);
  });

  it("preserves the input alpha channel exactly", async () => {
    const input = fixture();
    const output = (await executeStyle(provider, input, options())).image;
    for (let pixel = 0; pixel < input.width * input.height; pixel += 1) {
      expect(output.data[pixel * 4 + 3]).toBe(input.data[pixel * 4 + 3]);
    }
  });
});

describe("style recipe contract", () => {
  it("serializes normalized parameters, seed and domain canonically", async () => {
    const result = await executeStyle(BAYER_DITHER_PROVIDER, fixture(), options({
      params: { samplePitchMm: 1.8, matrixSize: 8 },
      seed: 42,
      domain: "plate"
    }));
    const serialized = serializeStyleRecipe(result.recipe);

    expect(serialized).toBe(
      '{"id":"bayer-dither","version":1,"params":{"matrixSize":8,"samplePitchMm":1.8},"seed":42,"domain":"plate","physical":{"widthMm":16,"heightMm":12,"minFeatureMm":0.4,"minPitchMm":0.6}}'
    );
  });

  it("rejects sub-printable physical parameters and unknown keys", async () => {
    await expect(executeStyle(SQUARE_MOSAIC_PROVIDER, fixture(), options({
      params: { cellSizeMm: 0.2 }
    }))).rejects.toThrow("cellSizeMm must be between");
    await expect(executeStyle(SQUARE_MOSAIC_PROVIDER, fixture(), options({
      params: { cellSizeMm: 4.8, typo: 1 }
    }))).rejects.toThrow("Unknown style parameter: typo");
  });

  it("requires a closed-loop evaluator for the plate-constrained domain", async () => {
    await expect(executeStyle(SQUARE_MOSAIC_PROVIDER, fixture(), options({
      domain: "plate-constrained",
      params: { cellSizeMm: 4.8 }
    }))).rejects.toThrow("requires a closed-loop evaluator");
  });

  it("selects the lowest-scoring constrained candidate deterministically", async () => {
    const result = await executeStyle(
      SQUARE_MOSAIC_PROVIDER,
      fixture(),
      options({ domain: "plate-constrained", params: { cellSizeMm: 4.8 } }),
      {
        candidateParams: [{ cellSizeMm: 8 }, { cellSizeMm: 2.4 }],
        evaluate: (_image, recipe) => Math.abs(recipe.params.cellSizeMm - 2.4)
      }
    );

    expect(result.recipe.params.cellSizeMm).toBe(2.4);
    expect(result.score).toBe(0);
  });
});

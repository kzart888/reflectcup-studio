import { describe, expect, it } from "vitest";
import type { RawRgbaImage } from "@/optics/types";
import {
  BAYER_DITHER_PROVIDER,
  CLUSTERED_DOT_HALFTONE_PROVIDER,
  ERROR_DIFFUSION_PROVIDER,
  executeStyle,
  findStyleProvider,
  HEX_MOSAIC_PROVIDER,
  millimetresToPixels,
  pixelsPerMillimetre,
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

function solidFixture(
  width: number,
  height: number,
  value: number,
  alpha = 255
): RawRgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4] = value;
    data[pixel * 4 + 1] = value;
    data[pixel * 4 + 2] = value;
    data[pixel * 4 + 3] = alpha;
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
  it("resolves providers by ID and version so an old recipe cannot silently upgrade", () => {
    expect(findStyleProvider("bayer-dither", 2)).toBe(BAYER_DITHER_PROVIDER);
    expect(findStyleProvider("bayer-dither", 1)).toBeUndefined();
  });

  it("serializes normalized parameters, seed and domain canonically", async () => {
    const result = await executeStyle(BAYER_DITHER_PROVIDER, fixture(), options({
      params: { samplePitchMm: 1.8, matrixSize: 8 },
      seed: 42,
      domain: "plate"
    }));
    const serialized = serializeStyleRecipe(result.recipe);

    expect(serialized).toBe(
      '{"id":"bayer-dither","version":2,"params":{"matrixSize":8,"samplePitchMm":1.8},"seed":42,"domain":"plate","physical":{"widthMm":16,"heightMm":12,"minFeatureMm":0.4,"minPitchMm":0.6}}'
    );
  });

  it("rejects sub-printable physical parameters and unknown keys", async () => {
    await expect(executeStyle(SQUARE_MOSAIC_PROVIDER, fixture(), options({
      params: { cellSizeMm: 0.2 }
    }))).rejects.toThrow("cellSizeMm must be between");
    await expect(executeStyle(SQUARE_MOSAIC_PROVIDER, fixture(), options({
      params: { cellSizeMm: 4.8, typo: 1 }
    }))).rejects.toThrow("Unknown style parameter: typo");
    await expect(executeStyle(BAYER_DITHER_PROVIDER, fixture(), options({
      params: { matrixSize: 4.5, samplePitchMm: 1.2 }
    }))).rejects.toThrow("matrixSize must be an integer");
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

  it("breaks equal constrained scores by canonical parameter order", async () => {
    const result = await executeStyle(
      SQUARE_MOSAIC_PROVIDER,
      fixture(),
      options({ domain: "plate-constrained", params: { cellSizeMm: 8 } }),
      {
        candidateParams: [{ cellSizeMm: 4.8 }, { cellSizeMm: 2.4 }],
        evaluate: () => 1
      }
    );

    expect(result.recipe.params.cellSizeMm).toBe(2.4);
  });
});

describe("physical raster conversion", () => {
  it("rounds upward so the effective feature never undercuts the millimetre request", () => {
    const plate = solidFixture(384, 384, 255);
    const physical = { ...PHYSICAL, widthMm: 182.4924, heightMm: 182.4924 };
    const pixels = millimetresToPixels(plate, physical, 0.6);

    expect(pixels).toBe(2);
    expect(pixels / pixelsPerMillimetre(plate, physical)).toBeGreaterThanOrEqual(0.6);
  });

  it("does not over-round an exact conversion", () => {
    const image = solidFixture(4, 4, 255);
    const physical = { ...PHYSICAL, widthMm: 2.4, heightMm: 2.4 };
    expect(millimetresToPixels(image, physical, 0.6)).toBe(1);
  });
});

describe("halftone definitions", () => {
  it("renders the canonical 4x4 Bayer ordering at 50% gray", async () => {
    const input = solidFixture(4, 4, 128);
    const output = (await executeStyle(BAYER_DITHER_PROVIDER, input, {
      params: { matrixSize: 4, samplePitchMm: 0.6 },
      seed: 0,
      domain: "target",
      physical: { widthMm: 2.4, heightMm: 2.4, minFeatureMm: 0.4, minPitchMm: 0.6 }
    })).image;
    const actual = Array.from({ length: 16 }, (_, pixel) => output.data[pixel * 4]);
    const expected = [
      255, 0, 255, 0,
      0, 255, 0, 255,
      255, 0, 255, 0,
      0, 255, 0, 255
    ];
    expect(actual).toEqual(expected);
  });

  it("lets clustered dots merge to cover solid black while preserving paper white", async () => {
    const physical = { widthMm: 8, heightMm: 8, minFeatureMm: 0.4, minPitchMm: 0.6 };
    const params = {
      pitchMm: 2,
      minDotDiameterMm: 0.4,
      maxDotDiameterMm: 2.82,
      gamma: 1
    };
    const [black, middle, white] = await Promise.all([
      executeStyle(CLUSTERED_DOT_HALFTONE_PROVIDER, solidFixture(80, 80, 0), {
        params, seed: 0, domain: "plate", physical
      }),
      executeStyle(CLUSTERED_DOT_HALFTONE_PROVIDER, solidFixture(80, 80, 128), {
        params, seed: 0, domain: "plate", physical
      }),
      executeStyle(CLUSTERED_DOT_HALFTONE_PROVIDER, solidFixture(80, 80, 255), {
        params, seed: 0, domain: "plate", physical
      })
    ]);
    const mean = (image: RawRgbaImage) => {
      let total = 0;
      for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
        total += image.data[pixel * 4];
      }
      return total / (image.width * image.height);
    };

    expect(mean(black.image)).toBeLessThan(2);
    expect(mean(middle.image)).toBeGreaterThan(120);
    expect(mean(middle.image)).toBeLessThan(136);
    expect(mean(white.image)).toBe(255);
  });

  it("keeps Floyd-Steinberg and Stucki neutral-tone area close to the input", async () => {
    const input = solidFixture(80, 80, 128);
    const physical = { widthMm: 8, heightMm: 8, minFeatureMm: 0.4, minPitchMm: 0.6 };
    for (const kernel of [1, 2]) {
      const output = (await executeStyle(ERROR_DIFFUSION_PROVIDER, input, {
        params: { kernel, samplePitchMm: 0.8 }, seed: 0, domain: "plate", physical
      })).image;
      let total = 0;
      for (let pixel = 0; pixel < output.width * output.height; pixel += 1) {
        total += output.data[pixel * 4];
      }
      expect(total / (output.width * output.height)).toBeGreaterThan(124);
      expect(total / (output.width * output.height)).toBeLessThan(132);
    }
  });

  it("rejects a clustered dot larger than the cell diagonal", async () => {
    await expect(executeStyle(CLUSTERED_DOT_HALFTONE_PROVIDER, fixture(), options({
      params: { pitchMm: 2, minDotDiameterMm: 0.4, maxDotDiameterMm: 2.9, gamma: 1 }
    }))).rejects.toThrow("pitchMm * sqrt(2)");
  });
});

describe("review preset coverage", () => {
  const presets = [
    ["square mosaic", SQUARE_MOSAIC_PROVIDER, { cellSizeMm: 4.8 }],
    ["hex mosaic", HEX_MOSAIC_PROVIDER, { cellDiameterMm: 5.4 }],
    ["clustered dots", CLUSTERED_DOT_HALFTONE_PROVIDER, {
      pitchMm: 2.4,
      minDotDiameterMm: 0.4,
      maxDotDiameterMm: 2.2,
      gamma: 1
    }],
    ["Bayer 4x4", BAYER_DITHER_PROVIDER, { matrixSize: 4, samplePitchMm: 1.2 }],
    ["Bayer 8x8", BAYER_DITHER_PROVIDER, { matrixSize: 8, samplePitchMm: 1.2 }],
    ["Floyd–Steinberg", ERROR_DIFFUSION_PROVIDER, { kernel: 1, samplePitchMm: 1.2 }],
    ["Stucki", ERROR_DIFFUSION_PROVIDER, { kernel: 2, samplePitchMm: 1.2 }]
  ] as const;

  it.each(presets)("runs the %s review variant deterministically", async (_label, provider, params) => {
    const input = fixture(64, 48);
    const first = await executeStyle(provider, input, options({ params }));
    const second = await executeStyle(provider, input, options({ params }));

    expect(first.image.data).toEqual(second.image.data);
    expect(first.recipe.params).toEqual(params);
  });

  it("keeps Bayer matrix sizes and diffusion kernels visually distinct", async () => {
    const input = fixture(64, 48);
    const variants = await Promise.all([
      executeStyle(BAYER_DITHER_PROVIDER, input, options({ params: { matrixSize: 4, samplePitchMm: 1.2 } })),
      executeStyle(BAYER_DITHER_PROVIDER, input, options({ params: { matrixSize: 8, samplePitchMm: 1.2 } })),
      executeStyle(ERROR_DIFFUSION_PROVIDER, input, options({ params: { kernel: 1, samplePitchMm: 1.2 } })),
      executeStyle(ERROR_DIFFUSION_PROVIDER, input, options({ params: { kernel: 2, samplePitchMm: 1.2 } }))
    ]);
    const signatures = variants.map((result) => Buffer.from(result.image.data).toString("base64"));

    expect(new Set(signatures).size).toBe(variants.length);
  });
});

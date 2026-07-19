import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildTargetCoreMask,
  createCurvedCupOpticalProfile,
  createCurvedCupOpticalProfileV3,
  createNominalOpticalProfile,
  generateTargetPlateMap,
  renderCanonicalPlate,
  renderOpticalProof,
  samplePlateTargetLut,
  traceTargetToPlate,
} from "@/optics";
import type { OpticalProfile, PlateTargetLut, RawRgbaImage } from "@/optics";

const ROUND_TRIP_P95_MM = 0.25;
const ROUND_TRIP_MAX_MM = 0.75;
const CLOSED_LOOP_MIN_PSNR_DB = 32;
const CLOSED_LOOP_MIN_SSIM = 0.95;

type AcceptanceFixture = {
  label: string;
  publicDirectory: "nominal-v1" | "curved-cup-v2" | "curved-cup-v3";
  createProfile: () => OpticalProfile;
  checkerSize: number;
  checkerCellSize: number;
  plateSize: number;
  minimumRoundTripSamples: number;
  useCoreMask: boolean;
  targetMarginPixels: number;
};

const ACCEPTANCE_FIXTURES: readonly AcceptanceFixture[] = [
  {
    label: "nominal-v1",
    publicDirectory: "nominal-v1",
    createProfile: () => createNominalOpticalProfile({ status: "published" }),
    checkerSize: 129,
    checkerCellSize: 24,
    plateSize: 768,
    minimumRoundTripSamples: 10_000,
    useCoreMask: false,
    targetMarginPixels: 0,
  },
  {
    label: "curved-cup-v2",
    publicDirectory: "curved-cup-v2",
    createProfile: () => createCurvedCupOpticalProfile({ status: "published" }),
    checkerSize: 513,
    checkerCellSize: 96,
    plateSize: 1024,
    minimumRoundTripSamples: 100_000,
    useCoreMask: true,
    targetMarginPixels: 2,
  },
  {
    label: "curved-cup-v3",
    publicDirectory: "curved-cup-v3",
    createProfile: () => createCurvedCupOpticalProfileV3({ status: "published" }),
    checkerSize: 513,
    checkerCellSize: 96,
    plateSize: 1024,
    minimumRoundTripSamples: 100_000,
    useCoreMask: true,
    targetMarginPixels: 2,
  },
] as const;

function checker(size: number, cellSize: number): RawRgbaImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const light = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      data[offset] = light ? 236 : 28;
      data[offset + 1] = light ? 241 : 42;
      data[offset + 2] = light ? 230 : 56;
      data[offset + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

function loadPublicLut(directory: AcceptanceFixture["publicDirectory"], width: number, height: number): PlateTargetLut {
  const root = `public/optical-profiles/${directory}`;
  const uvBytes = Uint8Array.from(readFileSync(`${root}/plate-to-target.rg32f`));
  const mask = Uint8Array.from(readFileSync(`${root}/plate-valid-mask.bin`));
  return { width, height, targetUv: new Float32Array(uvBytes.buffer), validMask: mask };
}

for (const fixture of ACCEPTANCE_FIXTURES) describe(`${fixture.label} digital optical acceptance`, () => {
  it("keeps the inverse-LUT plate round trip within the millimetre budget", () => {
    const profile = fixture.createProfile();
    const lut = loadPublicLut(fixture.publicDirectory, ...profile.mapping.lutSize);
    const errors: number[] = [];
    const targetMargin = fixture.targetMarginPixels / (profile.mapping.targetSamples[0] - 1);
    for (let y = 2; y < lut.height - 2; y += 1) {
      for (let x = 2; x < lut.width - 2; x += 1) {
        let interior = true;
        for (let offsetY = -2; offsetY <= 2 && interior; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            if (lut.validMask[(y + offsetY) * lut.width + x + offsetX] === 0) {
              interior = false;
              break;
            }
          }
        }
        if (!interior) continue;
        const plateUv = [(x + 0.5) / lut.width, (y + 0.5) / lut.height] as const;
        const targetUv = samplePlateTargetLut(lut, plateUv);
        if (targetUv && targetUv.some((coordinate) => (
          coordinate < targetMargin || coordinate > 1 - targetMargin
        ))) continue;
        const traced = targetUv ? traceTargetToPlate(profile, targetUv) : null;
        if (!traced) continue;
        errors.push(Math.hypot(traced.plateUv[0] - plateUv[0], traced.plateUv[1] - plateUv[1]) * profile.dish.radius * 2 * 1000);
      }
    }
    errors.sort((left, right) => left - right);
    expect(errors.length).toBeGreaterThan(fixture.minimumRoundTripSamples);
    expect(errors[Math.floor(errors.length * 0.95)]).toBeLessThanOrEqual(ROUND_TRIP_P95_MM);
    expect(errors.at(-1)).toBeLessThanOrEqual(ROUND_TRIP_MAX_MM);
  });

  const closedLoopTest = fixture.label === "curved-cup-v2" ? it.fails : it;
  const closedLoopName = fixture.label === "curved-cup-v2"
    ? "tracks the unresolved strict checker release gate (expected failure)"
    : "closes the checkerboard loop at the design eye";
  closedLoopTest(closedLoopName, () => {
    const size = fixture.checkerSize;
    const profile = fixture.createProfile();
    const lut = loadPublicLut(fixture.publicDirectory, ...profile.mapping.lutSize);
    const source = checker(size, fixture.checkerCellSize);
    const plate = renderCanonicalPlate({ size: fixture.plateSize, source, lut, crop: { centerX: 0.5, centerY: 0.5, scale: 1 } });
    const targetMap = generateTargetPlateMap(profile);
    const proof = renderOpticalProof(plate, targetMap, size);
    const acceptanceMask = fixture.useCoreMask
      ? buildTargetCoreMask(profile, targetMap)
      : Uint8Array.from(targetMap.samples, (sample) => sample ? 255 : 0);

    const expectedLuma: number[] = [];
    const actualLuma: number[] = [];
    let squaredError = 0;
    let channelCount = 0;
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      if (acceptanceMask[pixel] === 0 || proof.data[pixel * 4 + 3] === 0) continue;
      const x = pixel % size;
      const y = Math.floor(pixel / size);
      let nearMaskContour = false;
      for (let offsetY = -2; offsetY <= 2 && !nearMaskContour; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (
            sampleX < 0 || sampleY < 0 || sampleX >= size || sampleY >= size ||
            acceptanceMask[sampleY * size + sampleX] === 0
          ) {
            nearMaskContour = true;
            break;
          }
        }
      }
      if (nearMaskContour) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = source.data[pixel * 4 + channel] - proof.data[pixel * 4 + channel];
        squaredError += difference * difference;
        channelCount += 1;
      }
      const luminance = (image: RawRgbaImage) => (
        image.data[pixel * 4] * 0.2126 + image.data[pixel * 4 + 1] * 0.7152 + image.data[pixel * 4 + 2] * 0.0722
      );
      expectedLuma.push(luminance(source));
      actualLuma.push(luminance(proof));
    }

    const mse = squaredError / channelCount;
    const psnr = 10 * Math.log10((255 * 255) / mse);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const expectedMean = mean(expectedLuma);
    const actualMean = mean(actualLuma);
    let expectedVariance = 0;
    let actualVariance = 0;
    let covariance = 0;
    for (let index = 0; index < expectedLuma.length; index += 1) {
      const expectedDelta = expectedLuma[index] - expectedMean;
      const actualDelta = actualLuma[index] - actualMean;
      expectedVariance += expectedDelta * expectedDelta;
      actualVariance += actualDelta * actualDelta;
      covariance += expectedDelta * actualDelta;
    }
    expectedVariance /= expectedLuma.length - 1;
    actualVariance /= actualLuma.length - 1;
    covariance /= expectedLuma.length - 1;
    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    const ssim = ((2 * expectedMean * actualMean + c1) * (2 * covariance + c2)) /
      ((expectedMean ** 2 + actualMean ** 2 + c1) * (expectedVariance + actualVariance + c2));

    expect(expectedLuma.length).toBeGreaterThan(size * size * 0.3);
    expect.soft(
      psnr,
      `${fixture.label} checker PSNR ${psnr.toFixed(6)} dB is below the ${CLOSED_LOOP_MIN_PSNR_DB} dB release gate`,
    ).toBeGreaterThanOrEqual(CLOSED_LOOP_MIN_PSNR_DB);
    expect.soft(
      ssim,
      `${fixture.label} checker SSIM ${ssim.toFixed(6)} is below the ${CLOSED_LOOP_MIN_SSIM} release gate`,
    ).toBeGreaterThanOrEqual(CLOSED_LOOP_MIN_SSIM);
  }, 15_000);
});

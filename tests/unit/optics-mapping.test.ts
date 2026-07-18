import { describe, expect, it } from "vitest";
import {
  buildTargetValidMask,
  createNominalOpticalProfile,
  generateOpticalProfile,
  samplePlateTargetLut,
  traceTargetToPlate
} from "@/optics";

describe("nominal optical profile generation", () => {
  const generated = generateOpticalProfile(createNominalOpticalProfile({
    targetSamples: [65, 65],
    lutSize: [192, 192]
  }));

  it("produces a versioned, checksummed profile", () => {
    expect(generated.profile.schemaVersion).toBe(1);
    expect(generated.profile.version).toBe(1);
    expect(generated.profile.checksums.geometry).toMatch(/^[0-9a-f]{16}$/);
    expect(generated.profile.checksums.lut).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps unmapped target and plate regions explicit", () => {
    const targetMask = buildTargetValidMask(generated.targetToPlate);
    const targetCoverage = targetMask.filter(Boolean).length / targetMask.length;
    const plateMask = generated.plateToTarget.validMask;
    const plateCoverage = plateMask.filter(Boolean).length / plateMask.length;
    expect(targetCoverage).toBeGreaterThan(0.5);
    expect(targetCoverage).toBeLessThan(0.75);
    expect(plateCoverage).toBeGreaterThan(0.35);
    expect(plateCoverage).toBeLessThan(0.6);
    expect(plateMask.some((value) => value === 0)).toBe(true);
  });

  it("round-trips a design UV through the dish LUT within sampling tolerance", () => {
    const targetUv = [0.5, 0.5] as const;
    const forward = traceTargetToPlate(generated.profile, targetUv);
    expect(forward).not.toBeNull();
    const inverse = forward && samplePlateTargetLut(generated.plateToTarget, forward.plateUv);
    expect(inverse).not.toBeNull();
    expect(inverse?.[0]).toBeCloseTo(targetUv[0], 2);
    expect(inverse?.[1]).toBeCloseTo(targetUv[1], 2);
  });

  it("generates byte-identical LUTs from the same immutable geometry", () => {
    const again = generateOpticalProfile(createNominalOpticalProfile({
      targetSamples: [65, 65],
      lutSize: [192, 192]
    }));
    expect(again.profile.checksums).toEqual(generated.profile.checksums);
    expect(again.plateToTarget.validMask).toEqual(generated.plateToTarget.validMask);
    expect(again.plateToTarget.targetUv).toEqual(generated.plateToTarget.targetUv);
  });
});

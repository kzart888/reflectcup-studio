import { describe, expect, it } from "vitest";

import { deriveProductionPrintMetrics } from "@/domains/artifacts/print-metrics";
import { createNominalOpticalProfile } from "@/optics";

describe("production print metrics", () => {
  it("derives physical diameter and density from the snapshot profile", () => {
    const nominal = createNominalOpticalProfile();
    const nominalMetrics = deriveProductionPrintMetrics(nominal, 4096);
    expect(nominalMetrics.dishDiameterMm).toBeCloseTo(182.4924, 6);
    expect(nominalMetrics.exactPpi).toBeCloseTo(570.097, 2);
    expect(nominalMetrics.pngDensityPpi).toBe(570);

    const largerDish = { ...nominal, dish: { ...nominal.dish, radius: 0.125 } };
    const largerMetrics = deriveProductionPrintMetrics(largerDish, 4096);
    expect(largerMetrics.dishDiameterMm).toBe(250);
    expect(largerMetrics.pngDensityPpi).toBe(416);
  });
});

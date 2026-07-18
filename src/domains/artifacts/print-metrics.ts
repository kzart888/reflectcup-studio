import type { OpticalProfile } from "@/optics";

export function deriveProductionPrintMetrics(profile: OpticalProfile, pixelSize: number) {
  if (!Number.isInteger(pixelSize) || pixelSize <= 0) throw new Error("Production pixel size must be a positive integer");
  const dishDiameterMm = profile.dish.radius * 2 * 1000;
  const exactPpi = pixelSize * 25.4 / dishDiameterMm;
  return {
    dishDiameterMm,
    exactPpi,
    pngDensityPpi: Math.max(1, Math.round(exactPpi))
  };
}

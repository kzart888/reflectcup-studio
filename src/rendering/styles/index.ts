export * from "./types";
export * from "./core";
export * from "./mosaic";
export * from "./halftone";
export * from "./dither";

import { BAYER_DITHER_PROVIDER, ERROR_DIFFUSION_PROVIDER } from "./dither";
import { CLUSTERED_DOT_HALFTONE_PROVIDER } from "./halftone";
import { HEX_MOSAIC_PROVIDER, SQUARE_MOSAIC_PROVIDER } from "./mosaic";

export const STYLE_PROVIDER_REGISTRY = Object.freeze([
  SQUARE_MOSAIC_PROVIDER,
  HEX_MOSAIC_PROVIDER,
  CLUSTERED_DOT_HALFTONE_PROVIDER,
  BAYER_DITHER_PROVIDER,
  ERROR_DIFFUSION_PROVIDER
]);

export function findStyleProvider(id: string, version: number) {
  return STYLE_PROVIDER_REGISTRY.find((provider) => provider.id === id && provider.version === version);
}

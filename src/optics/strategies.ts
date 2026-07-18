import type { OpticalFillProcessor, OpticalStyleProcessor, Rgba } from "./types";

export const IDENTITY_STYLE: OpticalStyleProcessor = Object.freeze({
  id: "identity",
  version: 1,
  transform: (sample: Rgba) => sample
});

export const NO_FILL: OpticalFillProcessor = Object.freeze({
  id: "none",
  version: 1,
  fill: () => null
});

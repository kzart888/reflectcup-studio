import type { RawRgbaImage } from "@/optics/types";

export type StyleDomain = "target" | "plate" | "plate-constrained";
export type StyleParameterMap = Readonly<Record<string, number>>;

export const PROVISIONAL_MIN_FEATURE_MM = 0.4;
export const PROVISIONAL_MIN_PITCH_MM = 0.6;

export type StylePhysicalSpec = Readonly<{
  widthMm: number;
  heightMm: number;
  minFeatureMm: number;
  minPitchMm: number;
}>;

export type StyleProcessOptions = Readonly<{
  params: StyleParameterMap;
  seed: number;
  domain: StyleDomain;
  physical: StylePhysicalSpec;
}>;

export type StyleRecipe = Readonly<{
  id: string;
  version: number;
  params: StyleParameterMap;
  seed: number;
  domain: StyleDomain;
  physical: StylePhysicalSpec;
}>;

export type StyleParameterDefinition = Readonly<{
  key: string;
  label: string;
  unit: "mm" | "integer" | "ratio";
  defaultValue: number;
  minimum: number;
  maximum: number;
}>;

export interface StyleProvider {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly parameters: readonly StyleParameterDefinition[];
  process(input: RawRgbaImage, options: StyleProcessOptions): Promise<RawRgbaImage>;
}

export type PlateConstraintContext = Readonly<{
  /**
   * Extra parameter sets to compare with the requested recipe. The executor sorts
   * them canonically before evaluation, so caller ordering cannot change a tie.
   */
  candidateParams: readonly StyleParameterMap[];
  /**
   * Returns a closed-loop optical loss for a plate candidate. The production
   * caller will reconstruct the design-eye target with the immutable profile.
   */
  evaluate(candidate: RawRgbaImage, recipe: StyleRecipe): number | Promise<number>;
}>;

export type StyleExecutionResult = Readonly<{
  image: RawRgbaImage;
  recipe: StyleRecipe;
  score?: number;
}>;

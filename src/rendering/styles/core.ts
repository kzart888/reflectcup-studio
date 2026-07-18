import type { RawRgbaImage } from "@/optics/types";
import {
  PROVISIONAL_MIN_FEATURE_MM,
  PROVISIONAL_MIN_PITCH_MM,
  type PlateConstraintContext,
  type StyleExecutionResult,
  type StyleParameterDefinition,
  type StyleParameterMap,
  type StylePhysicalSpec,
  type StyleProcessOptions,
  type StyleProvider,
  type StyleRecipe
} from "./types";

export function defineStyleProvider(provider: StyleProvider): StyleProvider {
  return Object.freeze({ ...provider, parameters: Object.freeze([...provider.parameters]) });
}

export function assertRawRgbaImage(image: RawRgbaImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) {
    throw new Error("Style input dimensions must be positive integers");
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error("Style input RGBA buffer length does not match its dimensions");
  }
}

export function validatePhysicalSpec(physical: StylePhysicalSpec): void {
  for (const [key, value] of Object.entries(physical)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive finite number`);
  }
  if (physical.minFeatureMm < PROVISIONAL_MIN_FEATURE_MM) {
    throw new Error(`minFeatureMm cannot be below the provisional ${PROVISIONAL_MIN_FEATURE_MM} mm limit`);
  }
  if (physical.minPitchMm < PROVISIONAL_MIN_PITCH_MM) {
    throw new Error(`minPitchMm cannot be below the provisional ${PROVISIONAL_MIN_PITCH_MM} mm limit`);
  }
}

function normalizeParameters(
  definitions: readonly StyleParameterDefinition[],
  supplied: StyleParameterMap
): StyleParameterMap {
  const known = new Map(definitions.map((definition) => [definition.key, definition]));
  for (const key of Object.keys(supplied)) {
    if (!known.has(key)) throw new Error(`Unknown style parameter: ${key}`);
  }
  return Object.freeze(Object.fromEntries(definitions
    .map((definition) => {
      const value = supplied[definition.key] ?? definition.defaultValue;
      if (!Number.isFinite(value) || value < definition.minimum || value > definition.maximum) {
        throw new Error(
          `${definition.key} must be between ${definition.minimum} and ${definition.maximum}`
        );
      }
      return [definition.key, value] as const;
    })
    .sort(([left], [right]) => left.localeCompare(right))));
}

export function normalizeStyleRecipe(provider: StyleProvider, options: StyleProcessOptions): StyleRecipe {
  validatePhysicalSpec(options.physical);
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
    throw new Error("Style seed must be an unsigned 32-bit integer");
  }
  if (!["target", "plate", "plate-constrained"].includes(options.domain)) {
    throw new Error(`Unsupported style domain: ${String(options.domain)}`);
  }
  return Object.freeze({
    id: provider.id,
    version: provider.version,
    params: normalizeParameters(provider.parameters, options.params),
    seed: options.seed,
    domain: options.domain,
    physical: Object.freeze({
      widthMm: options.physical.widthMm,
      heightMm: options.physical.heightMm,
      minFeatureMm: options.physical.minFeatureMm,
      minPitchMm: options.physical.minPitchMm
    })
  });
}

export function optionsFromRecipe(recipe: StyleRecipe): StyleProcessOptions {
  return {
    params: recipe.params,
    seed: recipe.seed,
    domain: recipe.domain,
    physical: recipe.physical
  };
}

export function serializeStyleRecipe(recipe: StyleRecipe): string {
  const params = Object.fromEntries(Object.entries(recipe.params).sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({
    id: recipe.id,
    version: recipe.version,
    params,
    seed: recipe.seed,
    domain: recipe.domain,
    physical: {
      widthMm: recipe.physical.widthMm,
      heightMm: recipe.physical.heightMm,
      minFeatureMm: recipe.physical.minFeatureMm,
      minPitchMm: recipe.physical.minPitchMm
    }
  });
}

function candidateKey(params: StyleParameterMap): string {
  return JSON.stringify(Object.fromEntries(Object.entries(params).sort(([left], [right]) => left.localeCompare(right))));
}

export async function executeStyle(
  provider: StyleProvider,
  input: RawRgbaImage,
  options: StyleProcessOptions,
  constraint?: PlateConstraintContext
): Promise<StyleExecutionResult> {
  assertRawRgbaImage(input);
  const baseRecipe = normalizeStyleRecipe(provider, options);
  if (baseRecipe.domain !== "plate-constrained") {
    return { image: await provider.process(input, optionsFromRecipe(baseRecipe)), recipe: baseRecipe };
  }
  if (!constraint) {
    throw new Error("plate-constrained style execution requires a closed-loop evaluator");
  }

  const candidates = new Map<string, StyleRecipe>();
  for (const params of [baseRecipe.params, ...constraint.candidateParams]) {
    const recipe = normalizeStyleRecipe(provider, { ...options, params });
    candidates.set(candidateKey(recipe.params), recipe);
  }
  const ordered = [...candidates.values()]
    .sort((left, right) => candidateKey(left.params).localeCompare(candidateKey(right.params)));

  let best: StyleExecutionResult | undefined;
  for (const recipe of ordered) {
    const image = await provider.process(input, optionsFromRecipe(recipe));
    const score = await constraint.evaluate(image, recipe);
    if (!Number.isFinite(score)) throw new Error("Plate constraint evaluator returned a non-finite score");
    if (!best || score < (best.score ?? Number.POSITIVE_INFINITY)) best = { image, recipe, score };
  }
  if (!best) throw new Error("Plate constraint execution produced no candidates");
  return best;
}

export function pixelsPerMillimetre(image: RawRgbaImage, physical: StylePhysicalSpec): number {
  validatePhysicalSpec(physical);
  return Math.min(image.width / physical.widthMm, image.height / physical.heightMm);
}

export function millimetresToPixels(image: RawRgbaImage, physical: StylePhysicalSpec, mm: number): number {
  if (!Number.isFinite(mm) || mm <= 0) throw new Error("Physical style dimensions must be positive");
  return Math.max(1, Math.round(mm * pixelsPerMillimetre(image, physical)));
}

export function requirePhysicalParameter(
  options: StyleProcessOptions,
  key: string,
  limit: "feature" | "pitch"
): number {
  const value = options.params[key];
  if (!Number.isFinite(value)) throw new Error(`Missing physical style parameter: ${key}`);
  const minimum = limit === "feature" ? options.physical.minFeatureMm : options.physical.minPitchMm;
  if (value < minimum) throw new Error(`${key} cannot be below the configured ${minimum} mm ${limit} limit`);
  return value;
}

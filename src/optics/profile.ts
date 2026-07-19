import { fnv1a64 } from "./checksum";
import type { OpticalProfile, RadialProfilePoint } from "./types";

export const OPTICAL_GENERATOR_VERSION = "nominal-raytrace-v1";
export const CURVED_OPTICAL_GENERATOR_VERSION = "curved-raytrace-core-region-v2";
export const CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION = "curved-raytrace-reversible-core-v3";

export const CURVED_CUP_RINGS_MM = [
  { y: 7.088845, radius: 31.952057 },
  { y: 15.912997, radius: 33.829522 },
  { y: 24.812346, radius: 35.462612 },
  { y: 42.783134, radius: 37.983385 },
  { y: 60.884979, radius: 39.497008 },
  { y: 79, radius: 40 }
] as const;

type MillimetreProfilePoint = { readonly y: number; readonly radius: number };

function endpointSlope(firstStep: number, secondStep: number, firstDelta: number, secondDelta: number): number {
  let slope = ((2 * firstStep + secondStep) * firstDelta - firstStep * secondDelta) /
    (firstStep + secondStep);
  if (Math.sign(slope) !== Math.sign(firstDelta)) return 0;
  if (Math.sign(firstDelta) !== Math.sign(secondDelta) && Math.abs(slope) > Math.abs(3 * firstDelta)) {
    slope = 3 * firstDelta;
  }
  return slope;
}

/** Fritsch-Carlson/PCHIP tangents preserve the monotonicity of the measured rings. */
function pchipTangents(points: readonly MillimetreProfilePoint[]): number[] {
  if (points.length < 2) throw new Error("A radial profile requires at least two measured rings");
  const steps: number[] = [];
  const deltas: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const step = points[index + 1].y - points[index].y;
    if (!(step > 0)) throw new Error("Measured ring heights must increase strictly");
    steps.push(step);
    deltas.push((points[index + 1].radius - points[index].radius) / step);
  }
  if (points.length === 2) return [deltas[0], deltas[0]];

  const tangents = new Array<number>(points.length);
  tangents[0] = endpointSlope(steps[0], steps[1], deltas[0], deltas[1]);
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = deltas[index - 1];
    const after = deltas[index];
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
      tangents[index] = 0;
      continue;
    }
    const beforeWeight = 2 * steps[index] + steps[index - 1];
    const afterWeight = steps[index] + 2 * steps[index - 1];
    tangents[index] = (beforeWeight + afterWeight) / (beforeWeight / before + afterWeight / after);
  }
  const last = points.length - 1;
  tangents[last] = endpointSlope(
    steps[last - 1],
    steps[last - 2],
    deltas[last - 1],
    deltas[last - 2]
  );
  return tangents;
}

export function sampleMonotoneRadiusMm(
  points: readonly MillimetreProfilePoint[],
  yMm: number
): number {
  const tangents = pchipTangents(points);
  if (yMm <= points[0].y) return points[0].radius;
  if (yMm >= points.at(-1)!.y) return points.at(-1)!.radius;
  let segment = 0;
  while (segment < points.length - 2 && yMm > points[segment + 1].y) segment += 1;
  const lower = points[segment];
  const upper = points[segment + 1];
  const step = upper.y - lower.y;
  const t = (yMm - lower.y) / step;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * lower.radius +
    (t3 - 2 * t2 + t) * step * tangents[segment] +
    (-2 * t3 + 3 * t2) * upper.radius +
    (t3 - t2) * step * tangents[segment + 1];
}

function roundMetres(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}

/** Includes every audited ring and keeps each interpolated segment at or below the requested pitch. */
export function resampleRadialProfile(
  points: readonly MillimetreProfilePoint[] = CURVED_CUP_RINGS_MM,
  maximumStepMm = 0.5
): readonly RadialProfilePoint[] {
  if (!(maximumStepMm > 0)) throw new Error("maximumStepMm must be positive");
  const result: RadialProfilePoint[] = [];
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const lower = points[segment];
    const upper = points[segment + 1];
    const divisions = Math.ceil((upper.y - lower.y) / maximumStepMm);
    for (let division = 0; division < divisions; division += 1) {
      const yMm = lower.y + (upper.y - lower.y) * division / divisions;
      result.push({
        y: roundMetres(yMm / 1000),
        radius: roundMetres(sampleMonotoneRadiusMm(points, yMm) / 1000)
      });
    }
  }
  const last = points.at(-1)!;
  result.push({ y: roundMetres(last.y / 1000), radius: roundMetres(last.radius / 1000) });
  return result;
}

const nominalGeometry = {
  dish: {
    radius: 0.0912462,
    sag: 0.01,
    sphereRadius: 0.4212935,
    center: [0, 0, 0] as const
  },
  cup: {
    axisOrigin: [-0.03, 0, 0] as const,
    radialProfile: [
      { y: 0.00107, radius: 0.04 },
      { y: 0.07307, radius: 0.04 }
    ] as const
  },
  designCamera: {
    position: [0.6, 0.48, 0] as const,
    target: [-0.03, 0.043, 0] as const,
    up: [0, 1, 0] as const,
    verticalFovDegrees: 35,
    targetFrame: {
      // The image plane is centred on the visible cup skin, not its hidden axis.
      center: [0.01, 0.04, 0] as const,
      width: 0.084,
      height: 0.076
    }
  }
};

const geometryChecksum = fnv1a64(JSON.stringify(nominalGeometry));

export function createNominalOpticalProfile(overrides: {
  targetSamples?: readonly [number, number];
  lutSize?: readonly [number, number];
  status?: OpticalProfile["status"];
} = {}): OpticalProfile {
  return {
    schemaVersion: 1,
    id: "nominal-cup-80-dish-182-v1",
    slug: "nominal-cup-80-dish-182",
    label: "Nominal 80 mm cup / 182 mm dish",
    version: 1,
    status: overrides.status ?? "draft",
    units: "metres",
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Y",
      platePlane: "XZ",
      printUv: "+X,-Z"
    },
    ...nominalGeometry,
    mapping: {
      targetSamples: overrides.targetSamples ?? [129, 129],
      lutSize: overrides.lutSize ?? [512, 512],
      maxPlateEdge: 0.008,
      generatorVersion: OPTICAL_GENERATOR_VERSION
    },
    checksums: {
      geometry: geometryChecksum,
      generator: fnv1a64(OPTICAL_GENERATOR_VERSION)
    }
  };
}

export function createCurvedCupOpticalProfile(overrides: {
  targetSamples?: readonly [number, number];
  lutSize?: readonly [number, number];
  status?: OpticalProfile["status"];
} = {}): OpticalProfile {
  const geometry = {
    ...nominalGeometry,
    cup: {
      axisOrigin: nominalGeometry.cup.axisOrigin,
      radialProfile: resampleRadialProfile()
    }
  };
  return {
    schemaVersion: 1,
    id: "curved-cup-80-dish-182-v2",
    slug: "curved-cup-80-dish-182",
    label: "Curved 80 mm cup / 182 mm dish",
    version: 2,
    status: overrides.status ?? "draft",
    units: "metres",
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Y",
      platePlane: "XZ",
      printUv: "+X,-Z"
    },
    ...geometry,
    mapping: {
      targetSamples: overrides.targetSamples ?? [513, 513],
      lutSize: overrides.lutSize ?? [512, 512],
      maxPlateEdge: 0.008,
      generatorVersion: CURVED_OPTICAL_GENERATOR_VERSION
    },
    checksums: {
      geometry: fnv1a64(JSON.stringify(geometry)),
      generator: fnv1a64(CURVED_OPTICAL_GENERATOR_VERSION)
    }
  };
}

/**
 * Same audited physical geometry as v2, with a new inverse-map/core contract.
 * v2 remains immutable because existing sessions and snapshots pin its bytes.
 */
export function createCurvedCupOpticalProfileV3(overrides: {
  targetSamples?: readonly [number, number];
  lutSize?: readonly [number, number];
  status?: OpticalProfile["status"];
} = {}): OpticalProfile {
  const geometry = {
    ...nominalGeometry,
    cup: {
      axisOrigin: nominalGeometry.cup.axisOrigin,
      radialProfile: resampleRadialProfile()
    }
  };
  return {
    schemaVersion: 1,
    id: "curved-cup-80-dish-182-v3",
    slug: "curved-cup-80-dish-182",
    label: "Curved 80 mm cup / 182 mm dish",
    version: 3,
    status: overrides.status ?? "draft",
    units: "metres",
    coordinateSystem: {
      handedness: "right",
      upAxis: "+Y",
      platePlane: "XZ",
      printUv: "+X,-Z"
    },
    ...geometry,
    mapping: {
      targetSamples: overrides.targetSamples ?? [513, 513],
      lutSize: overrides.lutSize ?? [512, 512],
      maxPlateEdge: 0.008,
      generatorVersion: CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION
    },
    checksums: {
      geometry: fnv1a64(JSON.stringify(geometry)),
      generator: fnv1a64(CURVED_REVERSIBLE_OPTICAL_GENERATOR_VERSION)
    }
  };
}

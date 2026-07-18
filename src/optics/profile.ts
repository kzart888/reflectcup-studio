import { fnv1a64 } from "./checksum";
import type { OpticalProfile } from "./types";

export const OPTICAL_GENERATOR_VERSION = "nominal-raytrace-v1";

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

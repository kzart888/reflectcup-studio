import type { CameraState, CropTransform, Vec3Tuple } from "@/lib/contracts";

export type Vec2 = readonly [number, number];
export type Vec3 = Vec3Tuple;

export type Ray = {
  origin: Vec3;
  direction: Vec3;
};

export type RadialProfilePoint = {
  /** Height above the plate datum, in metres. */
  y: number;
  /** Distance from the cup axis, in metres. */
  radius: number;
};

export type OpticalProfile = {
  schemaVersion: 1;
  id: string;
  slug: string;
  label: string;
  version: number;
  status: "draft" | "published" | "retired";
  units: "metres";
  coordinateSystem: {
    handedness: "right";
    upAxis: "+Y";
    platePlane: "XZ";
    printUv: "+X,-Z";
  };
  dish: {
    radius: number;
    sag: number;
    sphereRadius: number;
    center: Vec3;
  };
  cup: {
    axisOrigin: Vec3;
    radialProfile: readonly RadialProfilePoint[];
  };
  designCamera: CameraState & {
    up: Vec3;
    verticalFovDegrees: number;
    targetFrame: {
      center: Vec3;
      width: number;
      height: number;
    };
  };
  mapping: {
    targetSamples: readonly [number, number];
    lutSize: readonly [number, number];
    maxPlateEdge: number;
    generatorVersion: string;
  };
  checksums: {
    geometry: string;
    generator: string;
    lut?: string;
  };
};

export type TargetPlateSample = {
  targetUv: Vec2;
  plateUv: Vec2;
  cupPoint: Vec3;
  platePoint: Vec3;
};

export type TargetPlateMap = {
  width: number;
  height: number;
  samples: readonly (TargetPlateSample | null)[];
  /** Source profile used to build this map. Hand-authored test maps may omit it. */
  profile?: OpticalProfile;
};

export type PlateTargetLut = {
  width: number;
  height: number;
  /** RG target coordinates, top-left origin. Undefined pixels contain zeroes. */
  targetUv: Float32Array;
  /** 255 for mapped pixels and 0 for intentionally empty plate pixels. */
  validMask: Uint8Array;
};

export type GeneratedOpticalProfile = {
  profile: OpticalProfile;
  targetToPlate: TargetPlateMap;
  plateToTarget: PlateTargetLut;
  targetRegion: {
    /** Every target sample whose camera ray reaches the plate, including debug-only sheets. */
    rayHitMask: Uint8Array;
    /** The largest connected, dominant-orientation, locally invertible target sheet. */
    coreMask: Uint8Array;
    contour: TargetContourDocument;
  };
};

export type TargetContourPath = {
  role: "outer" | "hole";
  /** Normalized target UV coordinates. The closing segment is implicit. */
  points: readonly Vec2[];
};

export type TargetContourDocument = {
  schemaVersion: 1;
  coordinateSpace: "target-uv";
  fillRule: "evenodd";
  sourceSize: readonly [number, number];
  paths: readonly TargetContourPath[];
  /** FNV-1a checksum of every preceding field in canonical insertion order. */
  checksum: string;
};

export type RawRgbaImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

export type RenderPlateOptions = {
  size: number;
  crop: CropTransform;
  source: RawRgbaImage;
  lut: PlateTargetLut;
  style?: OpticalStyleProcessor;
  fill?: OpticalFillProcessor;
};

export type Rgba = readonly [number, number, number, number];

export interface OpticalStyleProcessor {
  readonly id: "identity" | string;
  readonly version: number;
  transform(sample: Rgba): Rgba;
}

export interface OpticalFillProcessor {
  readonly id: "none" | string;
  readonly version: number;
  fill(plateUv: Vec2): Rgba | null;
}

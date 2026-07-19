import type { SceneQuality } from "@/lib/contracts";

export type SubjectGeometryDetail = Readonly<{
  cupOuterSegments: number;
  cupInnerSegments: number;
  cupHandleTubularSegments: number;
  cupHandleRadialSegments: number;
  cupRimTubularSegments: number;
  cupBaseSegments: number;
  dishRadialSegments: number;
  dishAngularSegments: number;
  dishRimTubularSegments: number;
}>;

const LOW: SubjectGeometryDetail = Object.freeze({
  cupOuterSegments: 64,
  cupInnerSegments: 32,
  cupHandleTubularSegments: 32,
  cupHandleRadialSegments: 8,
  cupRimTubularSegments: 64,
  cupBaseSegments: 48,
  dishRadialSegments: 24,
  dishAngularSegments: 64,
  dishRimTubularSegments: 64,
});

const FULL: SubjectGeometryDetail = Object.freeze({
  cupOuterSegments: 128,
  cupInnerSegments: 128,
  cupHandleTubularSegments: 48,
  cupHandleRadialSegments: 12,
  cupRimTubularSegments: 128,
  cupBaseSegments: 96,
  dishRadialSegments: 42,
  dishAngularSegments: 128,
  dishRimTubularSegments: 128,
});

export const ADAPTIVE_SUBJECT_RENDERER_VERSION = "reflective-subject-grounded-scene-v5";

/**
 * Low changes tessellation only; it never changes the optical curve or LUT.
 * The renderer contract gate preserves the exact full-detail subject used by
 * immutable v2-v4 scene snapshots.
 */
export function subjectGeometryDetail(
  quality: SceneQuality,
  rendererVersion: string,
): SubjectGeometryDetail {
  if (rendererVersion !== ADAPTIVE_SUBJECT_RENDERER_VERSION) return FULL;
  return quality === "low" ? LOW : FULL;
}

export function groundedSkyboxResolution(quality: SceneQuality, authoredResolution: number): number {
  if (quality === "low") return Math.min(32, authoredResolution);
  if (quality === "medium") return Math.min(48, authoredResolution);
  return authoredResolution;
}

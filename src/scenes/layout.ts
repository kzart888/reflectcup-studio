/**
 * Runtime-only scene composition. These values never enter the optical profile,
 * crop transform, LUT or production renderer.
 *
 * The source GLBs are normalised with their lowest point at local Y=0. Keeping
 * floor-standing props on the declared floor prevents the floating furniture
 * regression that shipped in the v3 composition.
 */

export const TABLE_TOP_Y = -0.0028;

export const HOME_TABLE_Y_SCALE = 1.32;
export const HOME_TABLE_SOURCE_HEIGHT = 0.54885;
export const HOME_FLOOR_Y = TABLE_TOP_Y - HOME_TABLE_SOURCE_HEIGHT * HOME_TABLE_Y_SCALE;

// Measured from the published table mesh. The earlier 0.725922 m estimate
// omitted transformed slat height and let the tabletop intersect the saucer.
export const CAMP_TABLE_HEIGHT = 0.732011735;
export const CAMP_FLOOR_Y = TABLE_TOP_Y - CAMP_TABLE_HEIGHT;

export const HOME_SCENE_LAYOUT = Object.freeze({
  table: {
    position: [0, HOME_FLOOR_Y, 0] as const,
    // The 1.8 m axis must run across the viewer (Z), not through the camera
    // (X). v3 put the design camera inside the table footprint, making the
    // tabletop fill the frame and hiding every mid-ground prop.
    rotation: [0, Math.PI / 2, 0] as const,
    scale: [1, HOME_TABLE_Y_SCALE, 1] as const,
  },
  sofa: {
    position: [-2.15, HOME_FLOOR_Y, 0.55] as const,
    rotation: [0, -Math.PI / 2, 0] as const,
    scale: 0.68,
  },
  plant: {
    position: [-1.5, HOME_FLOOR_Y, -0.7] as const,
    rotation: [0, 0.45, 0] as const,
    // The source is a 267 mm desk plant. At 1.6x it reads as a compact floor
    // plant while remaining behind the optical subject.
    scale: 1.6,
  },
});

export const LEGACY_HOME_SCENE_LAYOUT_V3 = Object.freeze({
  table: {
    position: [0, HOME_FLOOR_Y, 0] as const,
    rotation: [0, 0, 0] as const,
    scale: [1, HOME_TABLE_Y_SCALE, 1] as const,
  },
  sofa: {
    position: [-1.5, -0.38, -0.8] as const,
    rotation: [0, -Math.PI / 2, 0] as const,
    scale: 0.55,
  },
  plant: {
    position: [-1.1, -0.1, 0.85] as const,
    rotation: [0, 0.45, 0] as const,
    scale: 0.55,
  },
});

export const CAMP_SCENE_LAYOUT = Object.freeze({
  tableSet: {
    position: [0.0797, CAMP_FLOOR_Y, -0.0711] as const,
    rotation: [0, -0.08, 0] as const,
  },
  tent: {
    position: [-1.4, CAMP_FLOOR_Y, 2.5] as const,
    rotation: [0, -0.52, 0] as const,
    // Keep the tent readable when orbiting without letting it intrude into the
    // fixed optical view as a clipped near-black wedge.
    scale: 0.4,
  },
  lantern: {
    position: [-0.2, TABLE_TOP_Y, 0.2] as const,
    rotation: [0, -0.2, 0] as const,
    scale: 0.65,
  },
});

export const LEGACY_CAMP_SCENE_LAYOUT_V3 = Object.freeze({
  tableSet: {
    position: [0.0797, CAMP_FLOOR_Y, -0.0711] as const,
    rotation: [0, -0.08, 0] as const,
    hiddenNodeNames: [
      "outdoor_table_chair_set_01_chair_01",
      "outdoor_table_chair_set_01_chair_02",
    ] as const,
  },
  tent: {
    position: [-1.78, CAMP_FLOOR_Y, -1.34] as const,
    rotation: [0, 0.34, 0] as const,
    scale: 0.28,
  },
  lantern: {
    position: [-0.18, TABLE_TOP_Y, 0.24] as const,
    rotation: [0, -0.2, 0] as const,
    scale: 0.4,
  },
});

export const PREVIEW_CAMERA_FAR_METRES = 8;

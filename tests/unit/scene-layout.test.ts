import { describe, expect, it } from "vitest";

import {
  CAMP_FLOOR_Y,
  CAMP_SCENE_LAYOUT,
  HOME_FLOOR_Y,
  HOME_SCENE_LAYOUT,
  PREVIEW_CAMERA_FAR_METRES,
  TABLE_TOP_Y,
} from "@/scenes/layout";

describe("scene composition layout", () => {
  it("puts every floor-standing prop on its scene floor", () => {
    expect(HOME_SCENE_LAYOUT.table.position[1]).toBe(HOME_FLOOR_Y);
    expect(HOME_SCENE_LAYOUT.sofa.position[1]).toBe(HOME_FLOOR_Y);
    expect(HOME_SCENE_LAYOUT.plant.position[1]).toBe(HOME_FLOOR_Y);
    expect(CAMP_SCENE_LAYOUT.tableSet.position[1]).toBe(CAMP_FLOOR_Y);
    expect(CAMP_SCENE_LAYOUT.tent.position[1]).toBe(CAMP_FLOOR_Y);
    expect(CAMP_SCENE_LAYOUT.lantern.position[1]).toBe(TABLE_TOP_Y);
  });

  it("keeps full-size context props while the optical subject stays at the origin", () => {
    expect(HOME_SCENE_LAYOUT.sofa.scale).toBeGreaterThanOrEqual(0.65);
    expect(HOME_SCENE_LAYOUT.plant.scale).toBeGreaterThanOrEqual(1.5);
    expect(CAMP_SCENE_LAYOUT.tent.scale).toBeGreaterThanOrEqual(0.4);
    expect(CAMP_SCENE_LAYOUT.lantern.scale).toBeGreaterThanOrEqual(0.6);
  });

  it("orients the indoor table across the design camera and retains the mid-ground", () => {
    expect(HOME_SCENE_LAYOUT.table.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(PREVIEW_CAMERA_FAR_METRES).toBeGreaterThanOrEqual(12);
  });
});

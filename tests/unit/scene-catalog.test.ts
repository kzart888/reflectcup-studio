import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENE_ID,
  findPublishedScene,
  PUBLISHED_SCENE_IDS,
  PUBLISHED_SCENES
} from "@/domains/scenes/catalog";
import { sessionPatchSchema } from "@/domains/sessions/validation";

describe("published scene catalog", () => {
  it("publishes the three versioned scene IDs with stable checksums", () => {
    expect(PUBLISHED_SCENE_IDS).toEqual([
      "studio-neutral",
      "warm-craftsman-home",
      "forest-camp-evening"
    ]);
    expect(DEFAULT_SCENE_ID).toBe("warm-craftsman-home");
    expect(PUBLISHED_SCENES).toHaveLength(3);
    for (const scene of PUBLISHED_SCENES) {
      expect(scene).toMatchObject({ version: 1, status: "published" });
      expect(scene.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(findPublishedScene(scene.id)).toEqual(scene);
    }
    expect(new Set(PUBLISHED_SCENES.map((scene) => scene.checksum)).size).toBe(3);
  });

  it("whitelists scene-only session patches", () => {
    for (const sceneId of PUBLISHED_SCENE_IDS) {
      expect(sessionPatchSchema.safeParse({ revision: 0, sceneId }).success).toBe(true);
    }
    expect(sessionPatchSchema.safeParse({ revision: 0, sceneId: "private-unpublished-scene" }).success).toBe(false);
    expect(sessionPatchSchema.safeParse({ revision: 0 }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { statSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_SCENE_ID,
  findPublishedScene,
  PUBLISHED_SCENE_IDS,
  PUBLISHED_SCENES
} from "@/domains/scenes/catalog";
import { sessionPatchSchema } from "@/domains/sessions/validation";
import { CUSTOMER_SCENES, getSceneDescriptor } from "@/scenes/catalog";

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

  it("keeps the client catalog aligned with the server contract and default", () => {
    expect(CUSTOMER_SCENES[0].id).toBe(DEFAULT_SCENE_ID);
    expect(new Set(CUSTOMER_SCENES.map((scene) => scene.id))).toEqual(new Set(PUBLISHED_SCENE_IDS));
    for (const published of PUBLISHED_SCENES) {
      const customer = getSceneDescriptor(published.id);
      expect(customer).toMatchObject({
        id: published.id,
        version: published.version,
        checksum: published.checksum,
      });
    }
    expect(getSceneDescriptor("unpublished-scene").id).toBe("studio-neutral");
  });

  it("ships every declared asset inside its download budget", () => {
    const byteBudgets = { low: 4_000_000, medium: 7_000_000, high: 12_000_000 } as const;
    for (const scene of CUSTOMER_SCENES) {
      for (const quality of ["low", "medium", "high"] as const) {
        const assets = scene.qualityAssets[quality];
        const urls = [assets.environment, ...assets.textures];
        expect(new Set(urls).size).toBe(urls.length);
        const actualBytes = urls.reduce((total, url) => {
          expect(url).toMatch(/^\/scenes\//);
          return total + statSync(path.resolve("public", url.slice(1))).size;
        }, 0);
        expect(actualBytes).toBeLessThanOrEqual(byteBudgets[quality]);
        expect(assets.approximateBytes).toBeLessThanOrEqual(byteBudgets[quality]);
        expect(Math.abs(assets.approximateBytes - actualBytes)).toBeLessThanOrEqual(1024);
      }
      expect(() => statSync(path.resolve("public", scene.tableShadow.url.slice(1)))).not.toThrow();
    }
    expect(() => statSync(path.resolve("public/scenes/shared/cup-contact-ao.png"))).not.toThrow();
  });
});

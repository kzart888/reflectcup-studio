import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SCENE_RELEASES } from "@/scenes/release-manifest";
import { initialSceneQuality } from "@/scenes/runtime-policy";

describe("scene runtime quality contract", () => {
  it("starts constrained devices at low and desktop at medium", () => {
    expect(initialSceneQuality({ coarsePointer: false, saveData: false })).toBe("medium");
    expect(initialSceneQuality({ coarsePointer: true, saveData: false })).toBe("low");
    expect(initialSceneQuality({ coarsePointer: false, saveData: true })).toBe("low");
    expect(initialSceneQuality({ coarsePointer: true, saveData: true })).toBe("low");
  });

  it("keeps each higher texture tier additive", () => {
    for (const release of SCENE_RELEASES) {
      const low = new Set(release.qualityAssets.low.textureKeys);
      const medium = new Set(release.qualityAssets.medium.textureKeys);
      const high = new Set(release.qualityAssets.high.textureKeys);

      for (const key of low) expect(medium.has(key), `${release.id}: low -> medium lost ${key}`).toBe(true);
      for (const key of medium) expect(high.has(key), `${release.id}: medium -> high lost ${key}`).toBe(true);
    }
  });

  it("does not remove semantic props when quality declines", () => {
    const source = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");

    // Quality may change tessellation or material maps, but it must not gate
    // customer-visible objects such as the plant, lantern or tree instances.
    expect(source).not.toMatch(/quality\s*!==\s*["']low["']\s*\?\s*</);
    expect(source).not.toMatch(/quality\s*===\s*["']low["']\s*\?\s*null\s*:/);
    expect(source).toContain("const count = TREE_POSITIONS.length;");
  });

  it("does not eagerly upload cached loader sources alongside configured clones", () => {
    const backdrop = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");
    const preview = readFileSync("src/rendering/ReflectiveCupPreview.tsx", "utf8");

    expect(backdrop).not.toContain("useTexture(");
    expect(preview).not.toContain("useTexture(");
    expect(preview).toContain("useLoader.clear(THREE.TextureLoader, url)");
  });

  it("never exposes a PMREM generated for a different scene resource key", () => {
    const preview = readFileSync("src/rendering/ReflectiveCupPreview.tsx", "utf8");

    expect(preview).toContain("const resourceKey = `${descriptor.id}:${descriptor.version}:${quality}:${contextGeneration}`");
    expect(preview).toContain("targetState?.key === resourceKey ? targetState.target.texture : undefined");
  });

  it("serves only immutable versioned and content-addressed scene paths with long-lived caching", () => {
    const config = readFileSync("next.config.ts", "utf8");

    expect(config).toContain("/scenes/:sceneId/v:version/:path*");
    expect(config).toContain("/scenes/shared/:hash/:path*");
    expect(config).toContain("public, max-age=31536000, immutable");
    expect(config).not.toContain('source: "/scenes/:path*"');
  });
});

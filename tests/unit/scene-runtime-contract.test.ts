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
      const lowRoles = Object.keys("modelKeys" in release.qualityAssets.low ? release.qualityAssets.low.modelKeys : {}).sort();
      const mediumRoles = Object.keys("modelKeys" in release.qualityAssets.medium ? release.qualityAssets.medium.modelKeys : {}).sort();
      const highRoles = Object.keys("modelKeys" in release.qualityAssets.high ? release.qualityAssets.high.modelKeys : {}).sort();
      expect(mediumRoles, `${release.id}: Low and Medium model composition drifted`).toEqual(lowRoles);
      expect(highRoles, `${release.id}: Medium and High model composition drifted`).toEqual(mediumRoles);
    }
  });

  it("does not remove semantic props when quality declines", () => {
    const source = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");

    // Quality may select compressed derivatives, but it must not gate a
    // customer-visible model role such as the plant, lantern or tent.
    expect(source).not.toMatch(/quality\s*!==\s*["']low["']\s*\?\s*</);
    expect(source).not.toMatch(/quality\s*===\s*["']low["']\s*\?\s*null\s*:/);
    expect(source).toContain('url={models.plant}');
    expect(source).toContain('url={models.lantern}');
    expect(source).toContain('url={models.tent}');
  });

  it("does not eagerly upload cached loader sources alongside configured clones", () => {
    const backdrop = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");
    const preview = readFileSync("src/rendering/ReflectiveCupPreview.tsx", "utf8");

    expect(backdrop).not.toContain("useTexture(");
    expect(preview).not.toContain("useTexture(");
    expect(preview).toContain("useLoader.clear(THREE.TextureLoader, url)");
    expect(preview).toContain("useLoader.clear(GLTFLoader, url)");
  });

  it("preserves shared PBR textures and enables packed material AO", () => {
    const backdrop = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");

    expect(backdrop).toContain("const textureCache = new Map<THREE.Texture, THREE.Texture>()");
    expect(backdrop).toContain("const materialCache = new Map<THREE.Material, THREE.Material>()");
    expect(backdrop).toContain("material.roughnessMap === material.metalnessMap");
    expect(backdrop).toContain("material.aoMap = material.roughnessMap");
    expect(backdrop).toContain("material.aoMapIntensity = 0.82");
  });

  it("ships the v4 context shells without exposing the near-wall home panorama", () => {
    const backdrop = readFileSync("src/scenes/SceneBackdrop.tsx", "utf8");
    const home = SCENE_RELEASES.find((release) => release.id === "warm-craftsman-home")!;
    const forest = SCENE_RELEASES.find((release) => release.id === "forest-camp-evening")!;

    expect(home).toMatchObject({
      version: 4,
      visual: { background: { mode: "solid" } },
      renderContract: { geometryVersion: "cc0-game-ready-layout-v4" },
    });
    expect(home.qualityAssets.low.textureKeys).toEqual([
      "room-floor-color",
      "room-floor-normal",
      "room-floor-roughness",
    ]);
    expect(forest).toMatchObject({
      version: 4,
      visual: { background: { mode: "environment", blur: 0 } },
      renderContract: { geometryVersion: "cc0-game-ready-context-v4" },
    });
    expect(forest.qualityAssets.low.textureKeys).toEqual([]);
    expect(forest.qualityAssets.medium.textureKeys).toEqual([]);
    expect(backdrop).toContain('name="large-craftsman-room-shell"');
    expect(backdrop).toContain('name="wide-forest-context"');
    expect(backdrop).toContain('name="room-oak-floor"');
    expect(backdrop).toContain('name="forest-earth-ground"');
    expect(backdrop).not.toContain('name="forest-midground-trunk"');
    expect(backdrop).not.toContain('name="forest-moss-patch"');
  });

  it("applies the baked cup contact AO only to its matching optical profile", () => {
    const preview = readFileSync("src/rendering/ReflectiveCupPreview.tsx", "utf8");

    expect(preview).toContain('profile.id === "curved-cup-v3"');
    expect(preview).toContain("<ProfileContactAo");
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
    expect(config).toContain("/profiles/:profileId/:path*");
    expect(config).toContain("public, max-age=31536000, immutable");
    expect(config).not.toContain('source: "/scenes/:path*"');
  });
});

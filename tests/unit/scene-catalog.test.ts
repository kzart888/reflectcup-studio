import { describe, expect, it } from "vitest";

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_SCENE_ID,
  findPublishedScene,
  PUBLISHED_SCENE_IDS,
  PUBLISHED_SCENES
} from "@/domains/scenes/catalog";
import { sessionPatchSchema } from "@/domains/sessions/validation";
import { CUSTOMER_SCENES, getSceneDescriptor } from "@/scenes/catalog";
import {
  LEGACY_SCENE_V1_IDENTITIES,
  LEGACY_SCENE_V2_RELEASES,
  SCENE_RELEASES,
  serializeSceneReleaseForChecksum,
} from "@/scenes/release-manifest";

const EXPECTED_RELEASES = {
  "studio-neutral": "b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616",
  "warm-craftsman-home": "ab9717f5abfa2796ac33d9abcc3b101b6dc9ecd1adddbfa41afada346b687b5e",
  "forest-camp-evening": "452639f3e3cf9d5723d9399799d783710a314ffa635cd07b5b9fbbc6ee10189c",
} as const;

describe("published scene catalog", () => {
  it("publishes the three versioned scene IDs with stable checksums", () => {
    expect(PUBLISHED_SCENE_IDS).toEqual([
      "studio-neutral",
      "warm-craftsman-home",
      "forest-camp-evening"
    ]);
    expect(DEFAULT_SCENE_ID).toBe("warm-craftsman-home");
    expect(PUBLISHED_SCENES).toHaveLength(3);
    const expectedVersions = { "studio-neutral": 2, "warm-craftsman-home": 3, "forest-camp-evening": 3 } as const;
    for (const scene of PUBLISHED_SCENES) {
      expect(scene).toMatchObject({ version: expectedVersions[scene.id], status: "published" });
      expect(scene.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(findPublishedScene(scene.id)).toEqual(scene);
    }
    expect(new Set(PUBLISHED_SCENES.map((scene) => scene.checksum)).size).toBe(3);
    expect(LEGACY_SCENE_V1_IDENTITIES).toEqual([
      {
        id: "studio-neutral",
        version: 1,
        checksum: "f685214cc9a8f47e54faebee825adf815a5355f6f22f1f3d03d0948d0cfa968e",
      },
      {
        id: "warm-craftsman-home",
        version: 1,
        checksum: "181e59e6f562bd14ee0ce15ebb30daf21441121a5c9d88b9201f1ee301a8300d",
      },
      {
        id: "forest-camp-evening",
        version: 1,
        checksum: "20494e2d416b37ad205dd091e8a3437f79376042fc96bff667f605f9fd19fff6",
      },
    ]);
    expect(LEGACY_SCENE_V2_RELEASES.map(({ id, version, checksum }) => ({ id, version, checksum }))).toEqual([
      { id: "studio-neutral", version: 2, checksum: "b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616" },
      { id: "warm-craftsman-home", version: 2, checksum: "db0c979d798ab55cd6c5b663812efb395ca15789dea5fcc5b6c68f6945fc7f16" },
      { id: "forest-camp-evening", version: 2, checksum: "04e18b82607a8b2d44c68b2b44d305964ac2754a53bf17447157ac321b235183" },
    ]);
  });

  it("binds each immutable checksum to assets, visual parameters and renderer versions", () => {
    for (const release of SCENE_RELEASES) {
      const calculated = createHash("sha256")
        .update(serializeSceneReleaseForChecksum(release))
        .digest("hex");
      expect(release.checksum).toBe(EXPECTED_RELEASES[release.id]);
      expect(calculated).toBe(release.checksum);
      expect(release.renderContract.geometryVersion).toMatch(/-v\d+$/);
      expect(release.renderContract.rendererVersion).toMatch(/-v\d+$/);

      const assetKeys = new Set(release.assets.map((asset) => asset.key));
      const assetUrls = new Set(release.assets.map((asset) => asset.url));
      expect(assetKeys.size).toBe(release.assets.length);
      expect(assetUrls.size).toBe(release.assets.length);
      for (const tier of Object.values(release.qualityAssets)) {
        expect(assetKeys.has(tier.environmentKey)).toBe(true);
        for (const key of tier.textureKeys) expect(assetKeys.has(key)).toBe(true);
        const modelKeys: Readonly<Record<string, string>> = "modelKeys" in tier
          ? tier.modelKeys as Readonly<Record<string, string>>
          : {};
        for (const key of Object.values(modelKeys)) expect(assetKeys.has(key)).toBe(true);
      }
      expect(assetKeys.has(release.visual.tableShadow.assetKey)).toBe(true);
      expect(assetKeys.has("cup-contact-ao")).toBe(true);

      for (const asset of release.assets) {
        if (asset.key === "cup-contact-ao" && release.version >= 3) {
          expect(asset.url).toMatch(/^\/profiles\/curved-cup-v3\//);
        } else if (asset.key === "cup-contact-ao") {
          expect(asset.url).toContain(asset.sha256.slice(0, 16));
        } else {
          expect(asset.url).toContain(`/v${release.version}/`);
        }
        const filename = path.resolve("public", asset.url.slice(1));
        const contents = readFileSync(filename);
        expect(contents.byteLength, asset.url).toBe(asset.bytes);
        expect(createHash("sha256").update(contents).digest("hex"), asset.url).toBe(asset.sha256);
      }
    }
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
      const release = SCENE_RELEASES.find((candidate) => candidate.id === published.id)!;
      expect(customer.assetUrls).toEqual(Object.fromEntries(release.assets.map((asset) => [asset.key, asset.url])));
    }
    expect(getSceneDescriptor("unpublished-scene").id).toBe("studio-neutral");
  });

  it("ships every declared asset inside its download budget", () => {
    const byteBudgets = { low: 4_000_000, medium: 7_000_000, high: 12_000_000 } as const;
    for (const scene of CUSTOMER_SCENES) {
      for (const quality of ["low", "medium", "high"] as const) {
        const assets = scene.qualityAssets[quality];
        const urls = [
          assets.environment,
          ...assets.textures,
          ...Object.values(assets.models),
          scene.tableShadow.url,
          scene.assetUrls["cup-contact-ao"],
        ];
        expect(new Set(urls).size).toBe(urls.length);
        const actualBytes = urls.reduce((total, url) => {
          expect(url).toMatch(/^\/(?:scenes|profiles)\//);
          return total + statSync(path.resolve("public", url.slice(1))).size;
        }, 0);
        expect(actualBytes).toBeLessThanOrEqual(byteBudgets[quality]);
        expect(assets.approximateBytes).toBeLessThanOrEqual(byteBudgets[quality]);
        expect(assets.approximateBytes).toBe(actualBytes);
      }
    }
  });
});

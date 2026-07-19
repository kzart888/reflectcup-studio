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
import { CUSTOMER_SCENES, getSceneDescriptor, sceneReferenceKey, SceneReplayError } from "@/scenes/catalog";
import {
  LEGACY_SCENE_V1_IDENTITIES,
  LEGACY_SCENE_V2_RELEASES,
  LEGACY_SCENE_V3_RELEASES,
  LEGACY_SCENE_V4_RELEASES,
  SCENE_RELEASES,
  serializeSceneReleaseForChecksum,
} from "@/scenes/release-manifest";

const EXPECTED_RELEASES = {
  "studio-neutral": "b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616",
  "warm-craftsman-home": "a69ed575767d84ee8105f8300bd4a3febb80931ad40bccb88147a70c04abeee1",
  "forest-camp-evening": "2d9e08cfa0c92ea284e95c3b8f39ddb0979d63b03248dce69d1a3cbe33b291f6",
} as const;

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw");
}

describe("published scene catalog", () => {
  it("publishes the three versioned scene IDs with stable checksums", () => {
    expect(PUBLISHED_SCENE_IDS).toEqual([
      "studio-neutral",
      "warm-craftsman-home",
      "forest-camp-evening"
    ]);
    expect(DEFAULT_SCENE_ID).toBe("warm-craftsman-home");
    expect(PUBLISHED_SCENES).toHaveLength(3);
    const expectedVersions = { "studio-neutral": 2, "warm-craftsman-home": 5, "forest-camp-evening": 5 } as const;
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
    expect(LEGACY_SCENE_V3_RELEASES.map(({ id, version, checksum }) => ({ id, version, checksum }))).toEqual([
      { id: "warm-craftsman-home", version: 3, checksum: "ab9717f5abfa2796ac33d9abcc3b101b6dc9ecd1adddbfa41afada346b687b5e" },
      { id: "forest-camp-evening", version: 3, checksum: "452639f3e3cf9d5723d9399799d783710a314ffa635cd07b5b9fbbc6ee10189c" },
    ]);
    expect(LEGACY_SCENE_V4_RELEASES.map(({ id, version, checksum }) => ({ id, version, checksum }))).toEqual([
      { id: "warm-craftsman-home", version: 4, checksum: "ee834113e1febd642ae02d0f135f3652d9e962ed437d40ef189d4af16a59079e" },
      { id: "forest-camp-evening", version: 4, checksum: "457ae5440ee49a4bdcf597c656b92c26f7350f67e85e739fb86621fb2a40ecb5" },
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
          // A code-only scene composition release may reuse immutable assets
          // from an earlier content path. The release checksum still binds the
          // exact URL, bytes and hash.
          expect(asset.url).toMatch(/^\/scenes\/[^/]+\/v\d+\//);
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

  it("replays an exact forest v4 reference without falling forward to v5", () => {
    const forestV4 = LEGACY_SCENE_V4_RELEASES[1];
    const reference = {
      sceneId: forestV4.id,
      sceneVersion: forestV4.version,
      sceneChecksum: forestV4.checksum,
    };
    const descriptor = getSceneDescriptor(sceneReferenceKey(reference));

    expect(descriptor).toMatchObject({
      id: "forest-camp-evening",
      version: 4,
      checksum: forestV4.checksum,
    });
    expect(descriptor.qualityAssets.low.models).toHaveProperty("tent");
    expect(getSceneDescriptor("forest-camp-evening").version).toBe(5);

    const checksumError = captureError(() => getSceneDescriptor({
      ...reference,
      sceneChecksum: "0".repeat(64),
    }));
    expect(checksumError).toBeInstanceOf(SceneReplayError);
    expect(checksumError).toMatchObject({ code: "SCENE_RELEASE_CHECKSUM_MISMATCH" });
    const forestV1Error = captureError(() => getSceneDescriptor({
      sceneId: LEGACY_SCENE_V1_IDENTITIES[2].id,
      sceneVersion: LEGACY_SCENE_V1_IDENTITIES[2].version,
      sceneChecksum: LEGACY_SCENE_V1_IDENTITIES[2].checksum,
    }));
    expect(forestV1Error).toMatchObject({ code: "SCENE_RELEASE_NOT_REPLAYABLE" });
    const forestV2Error = captureError(() => getSceneDescriptor({
      sceneId: LEGACY_SCENE_V2_RELEASES[2].id,
      sceneVersion: LEGACY_SCENE_V2_RELEASES[2].version,
      sceneChecksum: LEGACY_SCENE_V2_RELEASES[2].checksum,
    }));
    expect(forestV2Error).toMatchObject({ code: "SCENE_RELEASE_NOT_REPLAYABLE" });
  });

  it("ships every declared asset inside its download budget", () => {
    const byteBudgets = { low: 4_000_000, medium: 7_000_000, high: 12_000_000 } as const;
    for (const scene of CUSTOMER_SCENES) {
      for (const quality of ["low", "medium", "high"] as const) {
        const assets = scene.qualityAssets[quality];
        const urls = [
          assets.environment,
          assets.background,
          ...assets.textures,
          ...Object.values(assets.models),
          scene.tableShadow.url,
          scene.assetUrls["cup-contact-ao"],
          scene.groundOcclusion?.url,
        ].filter((url): url is string => Boolean(url));
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
    const forest = getSceneDescriptor("forest-camp-evening");
    const home = getSceneDescriptor("warm-craftsman-home");
    expect([
      home.qualityAssets.low.approximateBytes,
      home.qualityAssets.medium.approximateBytes,
      home.qualityAssets.high.approximateBytes,
    ]).toEqual([1_801_923, 2_198_273, 7_393_962]);
    expect(Object.values(home.qualityAssets).every((quality) => !(
      "sofa" in quality.models || "plant" in quality.models
    ))).toBe(true);
    expect([
      forest.qualityAssets.low.approximateBytes,
      forest.qualityAssets.medium.approximateBytes,
      forest.qualityAssets.high.approximateBytes,
    ]).toEqual([3_882_089, 6_641_334, 11_931_937]);
    expect(Object.values(forest.qualityAssets).every((quality) => !("tent" in quality.models))).toBe(true);
    expect(LEGACY_SCENE_V4_RELEASES[1].qualityAssets.low.modelKeys?.tent).toBe("model-tent");
  });
});

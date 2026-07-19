import type { SceneQuality } from "@/lib/contracts";

export const PUBLISHED_SCENE_IDS = [
  "studio-neutral",
  "warm-craftsman-home",
  "forest-camp-evening",
] as const;

export type PublishedSceneId = (typeof PUBLISHED_SCENE_IDS)[number];

export const DEFAULT_SCENE_ID: PublishedSceneId = "warm-craftsman-home";
export const SCENE_CHECKSUM_SCHEMA_VERSION = 2;

// Version 1 checksums were published before scene content was bound into the
// checksum. They remain pinned for existing immutable snapshots; the live
// catalog selects the content-addressed version 2 releases below.
export const LEGACY_SCENE_V1_IDENTITIES = Object.freeze([
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
] as const);

export type SceneAssetFile = {
  key: string;
  url: string;
  bytes: number;
  sha256: string;
};

export type SceneQualityManifest = {
  environmentKey: string;
  textureKeys: readonly string[];
};

export type SceneVisualContract = {
  background: {
    mode: "environment" | "solid";
    color: string;
    blur: number;
    intensity: number;
    rotationY: number;
  };
  lighting: {
    ambientIntensity: number;
    environmentIntensity: number;
    heroPosition: readonly [number, number, number];
    heroColor: string;
    heroIntensity: number;
  };
  subject: {
    printAmbient: number;
  };
  tableShadow: {
    assetKey: string;
    opacity: number;
    size: readonly [number, number];
    offset: readonly [number, number];
    rotation: number;
  };
};

export type SceneRenderContract = {
  geometryVersion: string;
  rendererVersion: string;
  environmentPipelineVersion: string;
  shadowPipelineVersion: string;
};

export type SceneRelease = {
  id: PublishedSceneId;
  version: number;
  status: "published";
  checksum: string;
  assets: readonly SceneAssetFile[];
  qualityAssets: Record<SceneQuality, SceneQualityManifest>;
  visual: SceneVisualContract;
  renderContract: SceneRenderContract;
};

const sharedContactAo: SceneAssetFile = {
  key: "cup-contact-ao",
  url: "/scenes/shared/f30bf914fdcc7fc6/cup-contact-ao.png",
  bytes: 17_250,
  sha256: "f30bf914fdcc7fc6360e4a0f99a23dbb4ec38e45fdaf83c4edca13949a860b7e",
};

export const SCENE_RELEASES = [
  {
    id: "studio-neutral",
    version: 2,
    status: "published",
    checksum: "b2284d246bab7eecab47690467374eca132330bf95f7aee7d5c01ec927df5616",
    assets: [
      {
        key: "environment-1k",
        url: "/scenes/studio-neutral/v2/studio_small_08_1k.hdr",
        bytes: 1_508_872,
        sha256: "f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba",
      },
      {
        key: "table-shadow",
        url: "/scenes/studio-neutral/v2/table-shadow.png",
        bytes: 17_297,
        sha256: "8883a7f375d4e5359afa3acc5f25b0030b94f58555f6885f91038f7f003e5070",
      },
      sharedContactAo,
    ],
    qualityAssets: {
      low: { environmentKey: "environment-1k", textureKeys: [] },
      medium: { environmentKey: "environment-1k", textureKeys: [] },
      high: { environmentKey: "environment-1k", textureKeys: [] },
    },
    visual: {
      background: { mode: "solid", color: "#ebe7df", blur: 0, intensity: 1, rotationY: 0 },
      lighting: {
        ambientIntensity: 0.46,
        environmentIntensity: 0.92,
        heroPosition: [0.42, 0.72, 0.36],
        heroColor: "#fffaf0",
        heroIntensity: 2.25,
      },
      subject: { printAmbient: 0.64 },
      tableShadow: {
        assetKey: "table-shadow",
        opacity: 0.84,
        size: [0.4, 0.32],
        offset: [0.012, -0.012],
        rotation: 0,
      },
    },
    renderContract: {
      geometryVersion: "neutral-studio-procedural-v1",
      rendererVersion: "reflective-subject-glsl3-v2",
      environmentPipelineVersion: "equirectangular-pmrem-idle-lru-v2",
      shadowPipelineVersion: "baked-decal-v1",
    },
  },
  {
    id: "warm-craftsman-home",
    version: 2,
    status: "published",
    checksum: "db0c979d798ab55cd6c5b663812efb395ca15789dea5fcc5b6c68f6945fc7f16",
    assets: [
      {
        key: "environment-1k",
        url: "/scenes/warm-craftsman-home/v2/environment-1k.hdr",
        bytes: 1_662_018,
        sha256: "fb0657b1145fa21107e5e925a9da6c8e84038ea6df585412e42400e8970670d1",
      },
      {
        key: "environment-2k",
        url: "/scenes/warm-craftsman-home/v2/environment-2k.hdr",
        bytes: 6_517_786,
        sha256: "e3d281b3773ee013069e14243b530f21f219b387f5319da1e3c5193f04ce68a1",
      },
      {
        key: "oak-color",
        url: "/scenes/warm-craftsman-home/v2/textures/oak-color.jpg",
        bytes: 336_305,
        sha256: "d171f45ef01bc6e239b00dfaa4961bcd27f7d8e93e3962da3bd3d0ce703d802c",
      },
      {
        key: "oak-normal",
        url: "/scenes/warm-craftsman-home/v2/textures/oak-normal.jpg",
        bytes: 193_626,
        sha256: "ba95eadc009818e161d0f753191f1bacc3fc861e593be0bc6d82b437f9ec8044",
      },
      {
        key: "oak-roughness",
        url: "/scenes/warm-craftsman-home/v2/textures/oak-roughness.jpg",
        bytes: 215_155,
        sha256: "f281f682e62fe322303dfeaa13dac18b5cb9e113617fe0aca43605b49161d82b",
      },
      {
        key: "table-shadow",
        url: "/scenes/warm-craftsman-home/v2/table-shadow.png",
        bytes: 21_818,
        sha256: "7905ea45eda58f1a6533442006043e5707fa07ad580fb57132f069859d36da31",
      },
      sharedContactAo,
    ],
    qualityAssets: {
      low: { environmentKey: "environment-1k", textureKeys: ["oak-color"] },
      medium: { environmentKey: "environment-1k", textureKeys: ["oak-color", "oak-normal", "oak-roughness"] },
      high: { environmentKey: "environment-2k", textureKeys: ["oak-color", "oak-normal", "oak-roughness"] },
    },
    visual: {
      background: { mode: "environment", color: "#d8c6aa", blur: 0.16, intensity: 0.82, rotationY: -0.52 },
      lighting: {
        ambientIntensity: 0.48,
        environmentIntensity: 0.96,
        heroPosition: [0.34, 0.66, 0.46],
        heroColor: "#fff0d2",
        heroIntensity: 2.55,
      },
      subject: { printAmbient: 0.64 },
      tableShadow: {
        assetKey: "table-shadow",
        opacity: 0.9,
        size: [0.42, 0.34],
        offset: [0.015, -0.018],
        rotation: -0.08,
      },
    },
    renderContract: {
      geometryVersion: "warm-craftsman-procedural-v2",
      rendererVersion: "reflective-subject-glsl3-v2",
      environmentPipelineVersion: "equirectangular-pmrem-idle-lru-v2",
      shadowPipelineVersion: "baked-decal-v1",
    },
  },
  {
    id: "forest-camp-evening",
    version: 2,
    status: "published",
    checksum: "04e18b82607a8b2d44c68b2b44d305964ac2754a53bf17447157ac321b235183",
    assets: [
      {
        key: "environment-1k",
        url: "/scenes/forest-camp-evening/v2/environment-1k.hdr",
        bytes: 1_899_638,
        sha256: "38a1fb0e3c3a8f36516107a9b6ca4d25b8ddf9196748607a68c5c06e234852da",
      },
      {
        key: "environment-2k",
        url: "/scenes/forest-camp-evening/v2/environment-2k.hdr",
        bytes: 7_537_076,
        sha256: "8aae232ebfcae34a8ee0154f4fbb793e659e7dfdf27e5e14beee67b42b5e32cc",
      },
      {
        key: "walnut-color",
        url: "/scenes/forest-camp-evening/v2/textures/walnut-color.jpg",
        bytes: 754_754,
        sha256: "d68da31655bf47024af893156a6a01a6c95bb60f55d97e2dc9bdd47be320e5b5",
      },
      {
        key: "walnut-normal",
        url: "/scenes/forest-camp-evening/v2/textures/walnut-normal.jpg",
        bytes: 344_338,
        sha256: "c42541f1bda0a14b39f120c24407eeba699af8ac85b371c7cef98ffd7d7b13bf",
      },
      {
        key: "walnut-roughness",
        url: "/scenes/forest-camp-evening/v2/textures/walnut-roughness.jpg",
        bytes: 574_415,
        sha256: "47ea12dbf649109b02eaa164dde9732a74e839957f29ad0ec7f5266b575d1835",
      },
      {
        key: "bark-color",
        url: "/scenes/forest-camp-evening/v2/textures/bark-color.jpg",
        bytes: 729_893,
        sha256: "4213441aebcb72b9911f5a860e9ce74a61a8f6ce3b9c23d1f204173e7e7f6066",
      },
      {
        key: "bark-normal",
        url: "/scenes/forest-camp-evening/v2/textures/bark-normal.jpg",
        bytes: 1_226_534,
        sha256: "9d1537b3429579436a62890bb7c5050a0172a15ce768787eacde81c5ccefc9cc",
      },
      {
        key: "bark-roughness",
        url: "/scenes/forest-camp-evening/v2/textures/bark-roughness.jpg",
        bytes: 201_307,
        sha256: "4e7f62508cf77faebfeee15ffb571ff02c45c18d5174aa19fcb8b98506359c5c",
      },
      {
        key: "table-shadow",
        url: "/scenes/forest-camp-evening/v2/table-shadow.png",
        bytes: 22_555,
        sha256: "adca9e9828f197667b69136bc3c1f5ff71d3ecdf99dd54ae15a97c763312d82f",
      },
      sharedContactAo,
    ],
    qualityAssets: {
      low: { environmentKey: "environment-1k", textureKeys: ["walnut-color", "bark-color"] },
      medium: {
        environmentKey: "environment-1k",
        textureKeys: ["walnut-color", "walnut-normal", "walnut-roughness", "bark-color"],
      },
      high: {
        environmentKey: "environment-2k",
        textureKeys: [
          "walnut-color",
          "walnut-normal",
          "walnut-roughness",
          "bark-color",
          "bark-normal",
          "bark-roughness",
        ],
      },
    },
    visual: {
      background: { mode: "environment", color: "#1e261e", blur: 0.1, intensity: 0.78, rotationY: 0.78 },
      lighting: {
        ambientIntensity: 0.38,
        environmentIntensity: 0.88,
        heroPosition: [0.28, 0.5, -0.42],
        heroColor: "#ffd394",
        heroIntensity: 2.45,
      },
      subject: { printAmbient: 0.56 },
      tableShadow: {
        assetKey: "table-shadow",
        opacity: 0.96,
        size: [0.44, 0.34],
        offset: [-0.014, 0.018],
        rotation: 0.1,
      },
    },
    renderContract: {
      geometryVersion: "forest-camp-procedural-v2",
      rendererVersion: "reflective-subject-glsl3-v2",
      environmentPipelineVersion: "equirectangular-pmrem-idle-lru-v2",
      shadowPipelineVersion: "baked-decal-v1",
    },
  },
] as const satisfies readonly SceneRelease[];

export function findSceneRelease(id: string): SceneRelease | undefined {
  return SCENE_RELEASES.find((scene) => scene.id === id);
}

export function sceneReleaseChecksumPayload(release: SceneRelease): unknown {
  return {
    schemaVersion: SCENE_CHECKSUM_SCHEMA_VERSION,
    id: release.id,
    version: release.version,
    status: release.status,
    assets: [...release.assets].sort((left, right) => (
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0
    )),
    qualityAssets: release.qualityAssets,
    visual: release.visual,
    renderContract: release.renderContract,
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported checksum value: ${typeof value}`);
}

export function serializeSceneReleaseForChecksum(release: SceneRelease): string {
  return canonicalJson(sceneReleaseChecksumPayload(release));
}

import type { SceneQuality } from "@/lib/contracts";
import {
  DEFAULT_SCENE_ID,
  findSceneRelease,
  LEGACY_SCENE_V1_IDENTITIES,
  LEGACY_SCENE_V2_RELEASES,
  LEGACY_SCENE_V3_RELEASES,
  LEGACY_SCENE_V4_RELEASES,
  SCENE_RELEASES,
  type PublishedSceneId,
  type SceneAssetFile,
  type SceneRenderContract,
  type SceneRelease,
  type SceneVisualContract,
} from "@/scenes/release-manifest";

export type SceneAssetSet = {
  environment: string;
  background?: string;
  textures: readonly string[];
  models: Readonly<Record<string, string>>;
  approximateBytes: number;
};

export type SceneDescriptor = {
  id: PublishedSceneId;
  version: number;
  customerLabel: string;
  shortLabel: string;
  checksum: string;
  assetUrls: Readonly<Record<string, string>>;
  qualityAssets: Record<SceneQuality, SceneAssetSet>;
  background: SceneVisualContract["background"];
  lighting: SceneVisualContract["lighting"];
  subject: SceneVisualContract["subject"];
  renderContract: SceneRenderContract;
  tableShadow: Omit<SceneVisualContract["tableShadow"], "assetKey"> & { url: string };
  groundOcclusion?: Omit<NonNullable<SceneVisualContract["groundOcclusion"]>, "assetKey"> & { url: string };
};

export type SceneReference = {
  sceneId: string;
  sceneVersion: number;
  sceneChecksum: string;
};

export type SceneReplayErrorCode =
  | "SCENE_RELEASE_NOT_REPLAYABLE"
  | "SCENE_RELEASE_CHECKSUM_MISMATCH"
  | "SCENE_RELEASE_NOT_FOUND"
  | "SCENE_REFERENCE_INVALID";

export class SceneReplayError extends Error {
  constructor(public readonly code: SceneReplayErrorCode, message: string) {
    super(message);
    this.name = "SceneReplayError";
  }
}

const SCENE_REFERENCE_KEY_PREFIX = "scene-release:";

const LABELS: Record<PublishedSceneId, { customerLabel: string; shortLabel: string }> = {
  "studio-neutral": { customerLabel: "Neutral optical studio", shortLabel: "Neutral studio" },
  "warm-craftsman-home": { customerLabel: "Warm Craftsman home", shortLabel: "Cozy home" },
  "forest-camp-evening": { customerLabel: "Forest camp at dusk", shortLabel: "Forest camp" },
};

function getAsset(release: SceneRelease, key: string): SceneAssetFile {
  const asset = release.assets.find((candidate) => candidate.key === key);
  if (!asset) throw new Error(`Scene ${release.id} references missing asset key: ${key}`);
  return asset;
}

function createQualityAssets(release: SceneRelease, quality: SceneQuality): SceneAssetSet {
  const tier = release.qualityAssets[quality];
  const environment = getAsset(release, tier.environmentKey);
  const background = tier.backgroundKey ? getAsset(release, tier.backgroundKey) : undefined;
  const textures = tier.textureKeys.map((key) => getAsset(release, key));
  const models = Object.fromEntries(
    Object.entries(tier.modelKeys ?? {}).map(([role, key]) => [role, getAsset(release, key)]),
  );
  const tableShadow = getAsset(release, release.visual.tableShadow.assetKey);
  const contactAo = getAsset(release, "cup-contact-ao");
  const groundOcclusion = release.visual.groundOcclusion
    ? getAsset(release, release.visual.groundOcclusion.assetKey)
    : undefined;
  return {
    environment: environment.url,
    background: background?.url,
    textures: textures.map((asset) => asset.url),
    models: Object.freeze(Object.fromEntries(
      Object.entries(models).map(([role, asset]) => [role, asset.url]),
    )),
    approximateBytes: [environment, background, ...textures, ...Object.values(models), tableShadow, contactAo, groundOcclusion]
      .filter((asset): asset is SceneAssetFile => Boolean(asset))
      .reduce((total, asset) => total + asset.bytes, 0),
  };
}

function createDescriptor(release: SceneRelease): SceneDescriptor {
  const labels = LABELS[release.id];
  const tableShadowAsset = getAsset(release, release.visual.tableShadow.assetKey);
  const groundOcclusionAsset = release.visual.groundOcclusion
    ? getAsset(release, release.visual.groundOcclusion.assetKey)
    : undefined;
  const tableShadow = release.visual.tableShadow;
  return Object.freeze({
    id: release.id,
    version: release.version,
    ...labels,
    checksum: release.checksum,
    assetUrls: Object.freeze(Object.fromEntries(release.assets.map((asset) => [asset.key, asset.url]))),
    qualityAssets: {
      low: createQualityAssets(release, "low"),
      medium: createQualityAssets(release, "medium"),
      high: createQualityAssets(release, "high"),
    },
    background: release.visual.background,
    lighting: release.visual.lighting,
    subject: release.visual.subject,
    renderContract: release.renderContract,
    tableShadow: {
      opacity: tableShadow.opacity,
      size: tableShadow.size,
      offset: tableShadow.offset,
      rotation: tableShadow.rotation,
      url: tableShadowAsset.url,
    },
    groundOcclusion: release.visual.groundOcclusion && groundOcclusionAsset
      ? {
          opacity: release.visual.groundOcclusion.opacity,
          size: release.visual.groundOcclusion.size,
          offset: release.visual.groundOcclusion.offset,
          rotation: release.visual.groundOcclusion.rotation,
          url: groundOcclusionAsset.url,
        }
      : undefined,
  });
}

const CUSTOMER_ORDER: readonly PublishedSceneId[] = [
  DEFAULT_SCENE_ID,
  "forest-camp-evening",
  "studio-neutral",
];

export const CUSTOMER_SCENES: readonly SceneDescriptor[] = Object.freeze(
  CUSTOMER_ORDER.map((id) => createDescriptor(findSceneRelease(id)!)),
);

const sceneById = new Map(CUSTOMER_SCENES.map((scene) => [scene.id, scene]));

const replayableReleaseByIdentity = new Map<string, SceneRelease>();
for (const release of [
  LEGACY_SCENE_V2_RELEASES[0],
  ...LEGACY_SCENE_V3_RELEASES,
  ...LEGACY_SCENE_V4_RELEASES,
  ...SCENE_RELEASES,
] as readonly SceneRelease[]) {
  const identity = `${release.id}:v${release.version}`;
  const existing = replayableReleaseByIdentity.get(identity);
  if (existing && existing.checksum !== release.checksum) {
    throw new Error(`Scene release identity is not immutable: ${identity}`);
  }
  replayableReleaseByIdentity.set(identity, release);
}

const replayableSceneByIdentity = new Map(
  [...replayableReleaseByIdentity].map(([identity, release]) => [identity, createDescriptor(release)]),
);

const knownNonReplayableByIdentity = new Map([
  ...LEGACY_SCENE_V1_IDENTITIES,
  ...LEGACY_SCENE_V2_RELEASES.slice(1),
].map((release) => [`${release.id}:v${release.version}`, release]));

function getReplayDescriptor(reference: SceneReference): SceneDescriptor {
  const identity = `${reference.sceneId}:v${reference.sceneVersion}`;
  const descriptor = replayableSceneByIdentity.get(identity);
  if (descriptor) {
    if (descriptor.checksum !== reference.sceneChecksum) {
      throw new SceneReplayError(
        "SCENE_RELEASE_CHECKSUM_MISMATCH",
        `Saved scene checksum does not match ${identity}`,
      );
    }
    return descriptor;
  }

  const knownNonReplayable = knownNonReplayableByIdentity.get(identity);
  if (knownNonReplayable) {
    if (knownNonReplayable.checksum !== reference.sceneChecksum) {
      throw new SceneReplayError(
        "SCENE_RELEASE_CHECKSUM_MISMATCH",
        `Saved scene checksum does not match ${identity}`,
      );
    }
    throw new SceneReplayError(
      "SCENE_RELEASE_NOT_REPLAYABLE",
      `Scene ${identity} does not have a complete compatible replay implementation`,
    );
  }

  throw new SceneReplayError(
    "SCENE_RELEASE_NOT_FOUND",
    `Saved scene release is not available: ${identity}`,
  );
}

function parseSceneReferenceKey(value: string): SceneReference | undefined {
  if (!value.startsWith(SCENE_REFERENCE_KEY_PREFIX)) return undefined;
  const match = /^scene-release:([^:]+):v([1-9]\d*):([a-f0-9]{64})$/.exec(value);
  if (!match) {
    throw new SceneReplayError("SCENE_REFERENCE_INVALID", "Saved scene reference is malformed");
  }
  return {
    sceneId: match[1],
    sceneVersion: Number(match[2]),
    sceneChecksum: match[3],
  };
}

export function getSceneDescriptor(reference: string | SceneReference): SceneDescriptor {
  if (typeof reference !== "string") return getReplayDescriptor(reference);
  const replayReference = parseSceneReferenceKey(reference);
  if (replayReference) return getReplayDescriptor(replayReference);
  return sceneById.get(reference as PublishedSceneId) ?? sceneById.get("studio-neutral")!;
}

export function sceneReferenceKey(reference: SceneReference): string {
  const descriptor = getReplayDescriptor(reference);
  return `${SCENE_REFERENCE_KEY_PREFIX}${descriptor.id}:v${descriptor.version}:${descriptor.checksum}`;
}

export async function preloadSceneAssets(
  reference: string | SceneReference,
  signal?: AbortSignal,
  quality: SceneQuality = "low",
): Promise<void> {
  const descriptor = getSceneDescriptor(reference);
  const assets = descriptor.qualityAssets[quality];
  const urls = [
    assets.environment,
    assets.background,
    ...assets.textures,
    ...Object.values(assets.models),
    descriptor.tableShadow.url,
    descriptor.assetUrls["cup-contact-ao"],
    descriptor.groundOcclusion?.url,
  ].filter((url): url is string => Boolean(url));
  await Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { signal, cache: "force-cache" });
    if (!response.ok) throw new Error(`Scene asset failed to load: ${url}`);
    await response.arrayBuffer();
  }));
}

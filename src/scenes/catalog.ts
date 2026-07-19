import type { SceneQuality } from "@/lib/contracts";
import {
  DEFAULT_SCENE_ID,
  findSceneRelease,
  type PublishedSceneId,
  type SceneAssetFile,
  type SceneRelease,
  type SceneVisualContract,
} from "@/scenes/release-manifest";

export type SceneAssetSet = {
  environment: string;
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
  tableShadow: Omit<SceneVisualContract["tableShadow"], "assetKey"> & { url: string };
  groundOcclusion?: Omit<NonNullable<SceneVisualContract["groundOcclusion"]>, "assetKey"> & { url: string };
};

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
    textures: textures.map((asset) => asset.url),
    models: Object.freeze(Object.fromEntries(
      Object.entries(models).map(([role, asset]) => [role, asset.url]),
    )),
    approximateBytes: [environment, ...textures, ...Object.values(models), tableShadow, contactAo, groundOcclusion]
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

export function getSceneDescriptor(id: string): SceneDescriptor {
  return sceneById.get(id as PublishedSceneId) ?? sceneById.get("studio-neutral")!;
}

export async function preloadSceneAssets(
  id: string,
  signal?: AbortSignal,
  quality: SceneQuality = "low",
): Promise<void> {
  const descriptor = getSceneDescriptor(id);
  const assets = descriptor.qualityAssets[quality];
  const urls = [
    assets.environment,
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

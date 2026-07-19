import {
  DEFAULT_SCENE_ID,
  LEGACY_SCENE_V1_IDENTITIES,
  PUBLISHED_SCENE_IDS,
  SCENE_RELEASES,
  type PublishedSceneId,
} from "@/scenes/release-manifest";

export { DEFAULT_SCENE_ID, PUBLISHED_SCENE_IDS };
export type { PublishedSceneId };

export type PublishedScene = {
  id: PublishedSceneId;
  version: number;
  status: "published";
  checksum: string;
};

export const PUBLISHED_SCENES: readonly PublishedScene[] = Object.freeze(
  SCENE_RELEASES.map(({ id, version, status, checksum }) => Object.freeze({ id, version, status, checksum })),
);

const sceneById = new Map(PUBLISHED_SCENES.map((scene) => [scene.id, scene]));
const legacyV1ById = new Map(LEGACY_SCENE_V1_IDENTITIES.map((scene) => [scene.id, scene]));

export function findPublishedScene(id: string): PublishedScene | undefined {
  return sceneById.get(id as PublishedSceneId);
}

export function isPublishedSceneId(id: string): id is PublishedSceneId {
  return sceneById.has(id as PublishedSceneId);
}

export function findLegacySceneV1Identity(id: string) {
  return legacyV1ById.get(id as PublishedSceneId);
}

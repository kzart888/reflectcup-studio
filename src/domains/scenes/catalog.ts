import { createHash } from "node:crypto";

export const PUBLISHED_SCENE_IDS = [
  "studio-neutral",
  "warm-craftsman-home",
  "forest-camp-evening"
] as const;

export type PublishedSceneId = (typeof PUBLISHED_SCENE_IDS)[number];

export type PublishedScene = {
  id: PublishedSceneId;
  version: number;
  status: "published";
  checksum: string;
};

export const DEFAULT_SCENE_ID: PublishedSceneId = "warm-craftsman-home";

const SCENE_CONTRACT_VERSION = 1;

function publishScene(id: PublishedSceneId, version: number): PublishedScene {
  const checksumInput = JSON.stringify({
    schemaVersion: SCENE_CONTRACT_VERSION,
    id,
    version,
    status: "published"
  });
  return Object.freeze({
    id,
    version,
    status: "published" as const,
    checksum: createHash("sha256").update(checksumInput).digest("hex")
  });
}

export const PUBLISHED_SCENES: readonly PublishedScene[] = Object.freeze([
  publishScene("studio-neutral", 1),
  publishScene("warm-craftsman-home", 1),
  publishScene("forest-camp-evening", 1)
]);

const sceneById = new Map(PUBLISHED_SCENES.map((scene) => [scene.id, scene]));

export function findPublishedScene(id: string): PublishedScene | undefined {
  return sceneById.get(id as PublishedSceneId);
}

export function isPublishedSceneId(id: string): id is PublishedSceneId {
  return sceneById.has(id as PublishedSceneId);
}

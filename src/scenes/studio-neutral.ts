import type { SceneQuality } from "@/lib/contracts";

export type ScenePreset = {
  id: string;
  version: number;
  label: string;
  background: string;
  table: string;
  keyLightIntensity: Record<SceneQuality, number>;
  contactShadowResolution: Record<SceneQuality, number>;
};

export const studioNeutralScene: ScenePreset = {
  id: "studio-neutral",
  version: 1,
  label: "Neutral studio",
  background: "#ebe7df",
  table: "#d8d2c8",
  keyLightIntensity: { low: 2.2, medium: 2.6, high: 3 },
  contactShadowResolution: { low: 128, medium: 256, high: 512 },
};

export const sceneRegistry = new Map([[studioNeutralScene.id, studioNeutralScene]]);

export function getScenePreset(id: string): ScenePreset {
  return sceneRegistry.get(id) ?? studioNeutralScene;
}

import type { SceneQuality } from "@/lib/contracts";

export type SceneRuntimeHints = {
  coarsePointer: boolean;
  saveData: boolean;
};

export function initialSceneQuality(hints: SceneRuntimeHints): SceneQuality {
  return hints.coarsePointer || hints.saveData ? "low" : "medium";
}

export function browserSceneRuntimeHints(): SceneRuntimeHints {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { coarsePointer: false, saveData: false };
  }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    saveData: connection?.saveData === true,
  };
}

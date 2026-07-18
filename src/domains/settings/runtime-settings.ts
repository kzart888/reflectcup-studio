import { inArray } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { appSettings } from "@/db/schema";
import type { PreviewRuntimeSettings } from "@/lib/contracts";

export const PREVIEW_SETTING_KEYS = [
  "preview.toneMappingExposure",
  "preview.mobileDprCap",
  "preview.desktopDprCap",
  "preview.keyLightMultiplier"
] as const;

export const DEFAULT_PREVIEW_RUNTIME_SETTINGS: PreviewRuntimeSettings = {
  toneMappingExposure: 1.08,
  mobileDprCap: 1.5,
  desktopDprCap: 2,
  keyLightMultiplier: 1
};

export const previewSettingsUpdateSchema = z.object({
  settings: z.object({
    "preview.toneMappingExposure": z.number().finite().min(0.6).max(1.8).optional(),
    "preview.mobileDprCap": z.number().finite().min(1).max(1.5).optional(),
    "preview.desktopDprCap": z.number().finite().min(1).max(2).optional(),
    "preview.keyLightMultiplier": z.number().finite().min(0.5).max(1.5).optional()
  }).strict().refine((settings) => Object.keys(settings).length > 0, "At least one preview setting is required")
}).strict();

export async function getPreviewRuntimeSettings(): Promise<PreviewRuntimeSettings> {
  const rows = await getDatabase().select().from(appSettings).where(inArray(appSettings.key, [...PREVIEW_SETTING_KEYS]));
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const read = (key: string, fallback: number, minimum: number, maximum: number) => {
    const value = values[key];
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
  };
  return {
    toneMappingExposure: read("preview.toneMappingExposure", DEFAULT_PREVIEW_RUNTIME_SETTINGS.toneMappingExposure, 0.6, 1.8),
    mobileDprCap: read("preview.mobileDprCap", DEFAULT_PREVIEW_RUNTIME_SETTINGS.mobileDprCap, 1, 1.5),
    desktopDprCap: read("preview.desktopDprCap", DEFAULT_PREVIEW_RUNTIME_SETTINGS.desktopDprCap, 1, 2),
    keyLightMultiplier: read("preview.keyLightMultiplier", DEFAULT_PREVIEW_RUNTIME_SETTINGS.keyLightMultiplier, 0.5, 1.5)
  };
}

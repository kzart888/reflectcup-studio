import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDatabase } from "@/db/client";
import { appSettings } from "@/db/schema";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import {
  getPreviewRuntimeSettings,
  PREVIEW_SETTING_KEYS,
  previewSettingsUpdateSchema
} from "@/domains/settings/runtime-settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const rows = await getDatabase().select().from(appSettings).where(inArray(appSettings.key, [...PREVIEW_SETTING_KEYS]));
    const runtime = await getPreviewRuntimeSettings();
    return dataResponse({
      settings: {
        "preview.toneMappingExposure": runtime.toneMappingExposure,
        "preview.mobileDprCap": runtime.mobileDprCap,
        "preview.desktopDprCap": runtime.desktopDprCap,
        "preview.keyLightMultiplier": runtime.keyLightMultiplier
      },
      updatedAt: Object.fromEntries(rows.map((row) => [row.key, row.updatedAt.toISOString()]))
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "owner");
    const parsed = previewSettingsUpdateSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid settings update", parsed.error.flatten());
    const entries = Object.entries(parsed.data.settings);
    await getDatabase().transaction(async (transaction) => {
      for (const [key, value] of entries) {
        await transaction
          .insert(appSettings)
          .values({ key, value, updatedBy: principal.id, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedBy: principal.id, updatedAt: new Date() }
          });
      }
    });
    await writeAudit({
      actorAdminUserId: principal.id,
      action: "settings.updated",
      targetType: "app_settings",
      metadata: { keys: entries.map(([key]) => key) }
    });
    return dataResponse({ updated: entries.map(([key]) => key) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

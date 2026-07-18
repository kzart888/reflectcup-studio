import { and, eq, ne, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { opticalProfiles } from "@/db/schema";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { sha256, stableJson } from "@/domains/auth/security";
import { serializeProfile, validateOpticalProfileCandidate } from "@/domains/profiles/profile-service";

export const runtime = "nodejs";

const schema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
    lutAssetId: z.uuid().optional(),
    maskAssetId: z.uuid().optional(),
    status: z.enum(["published", "retired"]).optional()
  })
  .strict();

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "operator");
    const { id } = await context.params;
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid optical profile update", parsed.error.flatten());
    const existing = await getDatabase().query.opticalProfiles.findFirst({ where: eq(opticalProfiles.id, id) });
    if (!existing) throw new ApiError(404, "PROFILE_NOT_FOUND", "Optical profile was not found");
    if (parsed.data.status) requireRole(principal, "owner");
    if (existing.status !== "draft" && (parsed.data.label || parsed.data.profile || parsed.data.lutAssetId || parsed.data.maskAssetId)) {
      throw new ApiError(409, "PROFILE_IMMUTABLE", "Published and retired profiles are immutable");
    }
    if (existing.status === "published" && parsed.data.status === "retired") {
      const [retired] = await getDatabase()
        .update(opticalProfiles)
        .set({ status: "retired", updatedAt: new Date() })
        .where(and(eq(opticalProfiles.id, id), eq(opticalProfiles.status, "published")))
        .returning();
      if (!retired) throw new ApiError(409, "PROFILE_STATE_CHANGED", "The optical profile status changed concurrently");
      await writeAudit({
        actorAdminUserId: principal.id,
        action: "profile.retired",
        targetType: "optical_profile",
        targetId: id
      });
      return dataResponse({ profile: serializeProfile(retired) });
    }
    if (
      parsed.data.status === "published" &&
      (!(parsed.data.lutAssetId ?? existing.lutAssetId) || !(parsed.data.maskAssetId ?? existing.maskAssetId))
    ) {
      throw new ApiError(409, "PROFILE_ASSETS_MISSING", "A profile needs both LUT and mask assets before publishing");
    }
    const nextDocument = {
      ...existing.profile,
      ...parsed.data.profile,
      slug: existing.slug,
      label: parsed.data.label ?? existing.label,
      version: existing.version,
      status: parsed.data.status ?? existing.status
    };
    const nextLabel = parsed.data.label ?? existing.label;
    const nextStatus = parsed.data.status ?? existing.status;
    const nextLutAssetId = parsed.data.lutAssetId ?? existing.lutAssetId;
    const nextMaskAssetId = parsed.data.maskAssetId ?? existing.maskAssetId;
    const validated = await validateOpticalProfileCandidate({
      document: nextDocument,
      lutAssetId: nextLutAssetId,
      maskAssetId: nextMaskAssetId,
      identity: { slug: existing.slug, label: nextLabel, version: existing.version, status: nextStatus }
    });
    const updated = await getDatabase().transaction(async (transaction) => {
      if (parsed.data.status === "published") {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${existing.slug}, 0))`);
        await transaction
          .update(opticalProfiles)
          .set({ status: "retired", updatedAt: new Date() })
          .where(and(eq(opticalProfiles.slug, existing.slug), eq(opticalProfiles.status, "published"), ne(opticalProfiles.id, id)));
      }
      const [row] = await transaction
        .update(opticalProfiles)
        .set({
          label: parsed.data.label,
          profile: validated.document as unknown as Record<string, unknown>,
          checksum: sha256(stableJson(validated.document)),
          lutAssetId: parsed.data.lutAssetId,
          maskAssetId: parsed.data.maskAssetId,
          status: parsed.data.status,
          publishedAt: parsed.data.status === "published" ? new Date() : undefined,
          updatedAt: new Date()
        })
        .where(eq(opticalProfiles.id, id))
        .returning();
      return row;
    });
    await writeAudit({
      actorAdminUserId: principal.id,
      action: parsed.data.status ? `profile.${parsed.data.status}` : "profile.updated",
      targetType: "optical_profile",
      targetId: id
    });
    return dataResponse({ profile: serializeProfile(updated) });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiErrorResponse(new ApiError(409, "PROFILE_PUBLISH_CONFLICT", "Another profile version was published concurrently"));
    }
    return apiErrorResponse(error);
  }
}

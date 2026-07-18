import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { opticalProfiles } from "@/db/schema";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { sha256, stableJson } from "@/domains/auth/security";
import { serializeProfile, validateOpticalProfileCandidate } from "@/domains/profiles/profile-service";
import { listProfiles } from "@/repositories/profiles";

export const runtime = "nodejs";

const importedProfileSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
    label: z.string().trim().min(1).max(160),
    profile: z.record(z.string(), z.unknown()),
    lutAssetId: z.uuid(),
    maskAssetId: z.uuid()
  })
  .strict();
const createSchema = z.union([
  z.object({ sourceProfileId: z.uuid() }).strict(),
  importedProfileSchema
]);

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    return dataResponse({ profiles: (await listProfiles()).map(serializeProfile) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "operator");
    const parsed = createSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid optical profile", parsed.error.flatten());
    let slug: string;
    let label: string;
    let document: Record<string, unknown>;
    let lutAssetId: string;
    let maskAssetId: string;
    if ("sourceProfileId" in parsed.data) {
      const source = await getDatabase().query.opticalProfiles.findFirst({
        where: eq(opticalProfiles.id, parsed.data.sourceProfileId)
      });
      if (!source || !source.lutAssetId || !source.maskAssetId) {
        throw new ApiError(404, "PROFILE_NOT_FOUND", "Source optical profile and assets were not found");
      }
      slug = source.slug;
      label = `${source.label} copy`;
      document = source.profile;
      lutAssetId = source.lutAssetId;
      maskAssetId = source.maskAssetId;
    } else {
      slug = parsed.data.slug;
      label = parsed.data.label;
      document = parsed.data.profile;
      lutAssetId = parsed.data.lutAssetId;
      maskAssetId = parsed.data.maskAssetId;
    }
    const [latest] = await getDatabase()
      .select({ version: opticalProfiles.version })
      .from(opticalProfiles)
      .where(eq(opticalProfiles.slug, slug))
      .orderBy(desc(opticalProfiles.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const profileDocument = { ...document, slug, label, version, status: "draft" };
    const validated = await validateOpticalProfileCandidate({
      document: profileDocument,
      lutAssetId,
      maskAssetId,
      identity: { slug, label, version, status: "draft" }
    });
    const [profile] = await getDatabase()
      .insert(opticalProfiles)
      .values({
        slug,
        label,
        version,
        status: "draft",
        profile: validated.document as unknown as Record<string, unknown>,
        checksum: sha256(stableJson(validated.document)),
        lutAssetId,
        maskAssetId,
        createdBy: principal.id
      })
      .returning();
    await writeAudit({ actorAdminUserId: principal.id, action: "profile.created", targetType: "optical_profile", targetId: profile.id });
    return dataResponse({ profile: serializeProfile(profile) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      return apiErrorResponse(new ApiError(400, "PROFILE_ASSET_INVALID", "LUT and mask assets must already exist"));
    }
    return apiErrorResponse(error);
  }
}

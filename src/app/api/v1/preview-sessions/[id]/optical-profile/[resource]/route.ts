import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";

import { getDatabase } from "@/db/client";
import { assets, opticalProfiles } from "@/db/schema";
import { apiErrorResponse, ApiError } from "@/domains/auth/http";
import { sha256 } from "@/domains/auth/security";
import { validateStoredOpticalProfile } from "@/domains/profiles/profile-service";
import { requirePreviewAccess } from "@/domains/sessions/access-service";
import { getSessionOrThrow } from "@/domains/sessions/session-service";
import { buildTargetContourDocument, buildTargetValidMask, generateTargetPlateMap } from "@/optics";
import { getStorage } from "@/storage/filesystem-storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; resource: string }> };

type DerivedTargetResources = {
  mask: Uint8Array;
  maskDigest: string;
  contour: Uint8Array;
  contourDigest: string;
};

const TARGET_RESOURCE_CACHE_LIMIT = 8;
const derivedTargetResources = new Map<string, Promise<DerivedTargetResources>>();

function deriveTargetResources(
  checksum: string,
  document: Parameters<typeof generateTargetPlateMap>[0]
): Promise<DerivedTargetResources> {
  const cached = derivedTargetResources.get(checksum);
  if (cached) return cached;
  const pending = Promise.resolve().then(async () => {
    const map = generateTargetPlateMap(document);
    const validMask = buildTargetValidMask(map);
    const [mask, contour] = await Promise.all([
      sharp(validMask, { raw: { width: map.width, height: map.height, channels: 1 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
      Promise.resolve(Buffer.from(JSON.stringify(buildTargetContourDocument(validMask, map.width, map.height))))
    ]);
    return {
      mask,
      maskDigest: sha256(mask),
      contour,
      contourDigest: sha256(contour)
    };
  }).catch((error) => {
    derivedTargetResources.delete(checksum);
    throw error;
  });
  derivedTargetResources.set(checksum, pending);
  if (derivedTargetResources.size > TARGET_RESOURCE_CACHE_LIMIT) {
    const oldest = derivedTargetResources.keys().next().value as string | undefined;
    if (oldest && oldest !== checksum) derivedTargetResources.delete(oldest);
  }
  return pending;
}

async function readPublishedTargetAsset(
  profileChecksum: string,
  kind: "optical-target-mask" | "optical-target-contour",
  mimeType: "image/png" | "application/json"
): Promise<{ body: Uint8Array; digest: string } | undefined> {
  const asset = await getDatabase().query.assets.findFirst({
    where: and(
      eq(assets.kind, kind),
      sql`${assets.ownerSessionId} is null`,
      sql`${assets.metadata}->>'profileChecksum' = ${profileChecksum}`
    )
  });
  if (!asset || asset.mimeType !== mimeType) return undefined;
  const body = await getStorage().get(asset.storageKey);
  if (body.byteLength !== asset.byteSize || sha256(body) !== asset.sha256) {
    throw new ApiError(500, "PROFILE_RESOURCE_INVALID", "Published optical resource failed integrity validation");
  }
  return { body, digest: asset.sha256 };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id, resource } = await context.params;
    if (resource !== "lut" && resource !== "mask" && resource !== "target-mask" && resource !== "target-contour") {
      throw new ApiError(404, "PROFILE_RESOURCE_NOT_FOUND", "Optical profile resource was not found");
    }
    await requirePreviewAccess(request, id);
    const session = await getSessionOrThrow(id);
    const profile = await getDatabase().query.opticalProfiles.findFirst({
      where: eq(opticalProfiles.id, session.opticalProfileId)
    });
    if (!profile) throw new ApiError(500, "PROFILE_MISSING", "The session optical profile no longer exists");
    const validated = await validateStoredOpticalProfile(profile);

    let body: Uint8Array;
    let mimeType: "application/octet-stream" | "image/png" | "application/json";
    let digest: string;
    if (resource === "lut") {
      body = validated.lutBytes;
      mimeType = "application/octet-stream";
      digest = validated.lutAsset.sha256;
    } else if (resource === "mask") {
      body = validated.maskBytes;
      mimeType = "application/octet-stream";
      digest = validated.maskAsset.sha256;
    } else if (resource === "target-mask") {
      const published = await readPublishedTargetAsset(profile.checksum, "optical-target-mask", "image/png");
      const derived = published ? undefined : await deriveTargetResources(profile.checksum, validated.document);
      body = published?.body ?? derived!.mask;
      mimeType = "image/png";
      digest = published?.digest ?? derived!.maskDigest;
    } else {
      const published = await readPublishedTargetAsset(profile.checksum, "optical-target-contour", "application/json");
      const derived = published ? undefined : await deriveTargetResources(profile.checksum, validated.document);
      body = published?.body ?? derived!.contour;
      mimeType = "application/json";
      digest = published?.digest ?? derived!.contourDigest;
    }

    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"sha256-${digest}"`
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

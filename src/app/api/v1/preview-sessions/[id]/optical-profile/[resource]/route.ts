import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";

import { getDatabase } from "@/db/client";
import { opticalProfiles } from "@/db/schema";
import { apiErrorResponse, ApiError } from "@/domains/auth/http";
import { sha256 } from "@/domains/auth/security";
import { validateStoredOpticalProfile } from "@/domains/profiles/profile-service";
import { requirePreviewAccess } from "@/domains/sessions/access-service";
import { getSessionOrThrow } from "@/domains/sessions/session-service";
import { buildTargetValidMask, generateTargetPlateMap } from "@/optics";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; resource: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id, resource } = await context.params;
    if (resource !== "lut" && resource !== "mask" && resource !== "target-mask") {
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
    let mimeType: "application/octet-stream" | "image/png";
    let digest: string;
    if (resource === "lut") {
      body = validated.lutBytes;
      mimeType = "application/octet-stream";
      digest = validated.lutAsset.sha256;
    } else if (resource === "mask") {
      body = validated.maskBytes;
      mimeType = "application/octet-stream";
      digest = validated.maskAsset.sha256;
    } else {
      const map = generateTargetPlateMap(validated.document);
      const mask = buildTargetValidMask(map);
      body = await sharp(mask, { raw: { width: map.width, height: map.height, channels: 1 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      mimeType = "image/png";
      digest = sha256(body);
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

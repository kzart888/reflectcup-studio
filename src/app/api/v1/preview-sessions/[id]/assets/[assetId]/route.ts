import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError } from "@/domains/auth/http";
import { requirePreviewAccess } from "@/domains/sessions/access-service";
import { findAsset } from "@/repositories/assets";
import { getStorage } from "@/storage/filesystem-storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; assetId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id, assetId } = await context.params;
    await requirePreviewAccess(request, id);
    const asset = await findAsset(assetId);
    if (!asset || asset.ownerSessionId !== id) throw new ApiError(404, "ASSET_NOT_FOUND", "Asset was not found");
    const body = await getStorage().openReadStream(asset.storageKey);
    return new Response(body, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.byteSize),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        ETag: `"sha256-${asset.sha256}"`
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

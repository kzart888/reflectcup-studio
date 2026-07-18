import { NextRequest } from "next/server";

import { authenticateAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError } from "@/domains/auth/http";
import { findAsset } from "@/repositories/assets";
import { getStorage } from "@/storage/filesystem-storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await authenticateAdmin(request);
    const { id } = await context.params;
    const asset = await findAsset(id);
    if (!asset) throw new ApiError(404, "ASSET_NOT_FOUND", "Asset was not found");
    const body = await getStorage().openReadStream(asset.storageKey);
    return new Response(body, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.byteSize),
        "Content-Disposition": asset.mimeType === "application/zip" ? `attachment; filename="reflectcup-${asset.id}.zip"` : "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        ETag: `"sha256-${asset.sha256}"`
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

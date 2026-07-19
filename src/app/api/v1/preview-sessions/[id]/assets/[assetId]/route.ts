import { NextRequest } from "next/server";
import sharp from "sharp";

import { apiErrorResponse, ApiError } from "@/domains/auth/http";
import { sha256 } from "@/domains/auth/security";
import { requirePreviewAccess } from "@/domains/sessions/access-service";
import { findAsset, readAssetPreviewMetadata } from "@/repositories/assets";
import { getStorage } from "@/storage/filesystem-storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; assetId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id, assetId } = await context.params;
    await requirePreviewAccess(request, id);
    const asset = await findAsset(assetId);
    if (!asset || asset.ownerSessionId !== id) throw new ApiError(404, "ASSET_NOT_FOUND", "Asset was not found");
    const wantsPreview = request.nextUrl.searchParams.get("variant") === "preview" && asset.kind === "source";
    const preview = wantsPreview ? readAssetPreviewMetadata(asset) : undefined;
    let body: BodyInit;
    let byteSize = asset.byteSize;
    let digest = asset.sha256;
    if (preview) {
      body = await getStorage().openReadStream(preview.previewStorageKey);
      byteSize = preview.previewByteSize;
      digest = preview.previewSha256;
    } else if (wantsPreview) {
      // Backward-compatible safety for sources uploaded before preview
      // sidecars existed. The result is private/no-store and never reaches
      // WebGL above a 2048 px edge.
      const original = await getStorage().get(asset.storageKey);
      const resized = await sharp(original)
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88, effort: 3, smartSubsample: true })
        .toBuffer();
      body = resized;
      byteSize = resized.byteLength;
      digest = sha256(resized);
    } else {
      body = await getStorage().openReadStream(asset.storageKey);
    }
    return new Response(body, {
      headers: {
        "Content-Type": wantsPreview ? "image/webp" : asset.mimeType,
        "Content-Length": String(byteSize),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        ETag: `"sha256-${digest}"`
      }
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

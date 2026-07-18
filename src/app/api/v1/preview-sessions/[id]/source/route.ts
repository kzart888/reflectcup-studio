import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseFormDataLimited } from "@/domains/auth/http";
import { DRAFT_ACCESS_TTL_SECONDS, requirePreviewAccess, sessionCookieName, sessionCookieOptions } from "@/domains/sessions/access-service";
import { consumeSessionActionBudget } from "@/domains/sessions/action-budget";
import { serializeAsset, serializeSession, uploadSource } from "@/domains/sessions/session-service";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { WorkGate } from "@/lib/work-gate";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const sourceRequestGate = new WorkGate(2, 2, "UPLOAD_SERVER_BUSY");

export async function POST(request: NextRequest, context: Context) {
  try {
    return await sourceRequestGate.run(async () => {
      enforceSameOrigin(request);
      const { id } = await context.params;
      await requirePreviewAccess(request, id);
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
        throw new ApiError(413, "UPLOAD_SIZE_INVALID", "Multipart upload exceeds the 20 MiB image limit");
      }
      await consumeSessionActionBudget({
        sessionId: id,
        action: "preview_source.attempted",
        limit: 30,
        windowMs: 60 * 60 * 1000
      });
      const form = await parseFormDataLimited(request, MAX_UPLOAD_BYTES + 1024 * 1024);
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "A file field is required");
      const result = await uploadSource(id, file);
      const response = dataResponse({ session: await serializeSession(result.row), asset: serializeAsset(result.asset, id) });
      const token = request.cookies.get(sessionCookieName(id))?.value;
      if (token) response.cookies.set(sessionCookieName(id), token, sessionCookieOptions(id, DRAFT_ACCESS_TTL_SECONDS));
      return response;
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

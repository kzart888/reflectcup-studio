import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import {
  CONFIRMED_ACCESS_TTL_SECONDS,
  requirePreviewAccess,
  sessionCookieName,
  sessionCookieOptions
} from "@/domains/sessions/access-service";
import { confirmSession, serializeSession } from "@/domains/sessions/session-service";
import { revisionSchema } from "@/domains/sessions/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const { id } = await context.params;
    await requirePreviewAccess(request, id);
    const parsed = revisionSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid confirmation request", parsed.error.flatten());
    const result = await confirmSession(id, parsed.data.revision);
    const response = dataResponse({
      session: await serializeSession(result.row),
      snapshot: {
        id: result.snapshot.id,
        revision: result.snapshot.revision,
        checksum: result.snapshot.checksum,
        createdAt: result.snapshot.createdAt.toISOString()
      }
    });
    const token = request.cookies.get(sessionCookieName(id))?.value;
    if (token) response.cookies.set(sessionCookieName(id), token, sessionCookieOptions(id, CONFIRMED_ACCESS_TTL_SECONDS));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

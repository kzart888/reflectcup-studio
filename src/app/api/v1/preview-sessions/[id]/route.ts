import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import {
  CONFIRMED_ACCESS_TTL_SECONDS,
  DRAFT_ACCESS_TTL_SECONDS,
  requirePreviewAccess,
  sessionCookieName,
  sessionCookieOptions
} from "@/domains/sessions/access-service";
import { getSessionOrThrow, patchSession, serializeSession } from "@/domains/sessions/session-service";
import { sessionPatchSchema } from "@/domains/sessions/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await requirePreviewAccess(request, id);
    const session = await serializeSession(await getSessionOrThrow(id));
    const response = dataResponse({ session });
    const token = request.cookies.get(sessionCookieName(id))?.value;
    const ttl = session.status === "confirmed" ? CONFIRMED_ACCESS_TTL_SECONDS : DRAFT_ACCESS_TTL_SECONDS;
    if (token) response.cookies.set(sessionCookieName(id), token, sessionCookieOptions(id, ttl));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const { id } = await context.params;
    await requirePreviewAccess(request, id);
    const parsed = sessionPatchSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid design update", parsed.error.flatten());
    const response = dataResponse({ session: await serializeSession(await patchSession(id, parsed.data)) });
    const token = request.cookies.get(sessionCookieName(id))?.value;
    if (token) response.cookies.set(sessionCookieName(id), token, sessionCookieOptions(id, DRAFT_ACCESS_TTL_SECONDS));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

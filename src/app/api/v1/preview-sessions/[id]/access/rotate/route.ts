import { NextRequest } from "next/server";

import { apiErrorResponse, dataResponse, enforceSameOrigin } from "@/domains/auth/http";
import {
  requirePreviewAccess,
  rotateResumeToken,
  sessionCookieName,
  sessionCookieOptions
} from "@/domains/sessions/access-service";
import { consumeSessionActionBudget } from "@/domains/sessions/action-budget";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const { id } = await context.params;
    await requirePreviewAccess(request, id);
    await consumeSessionActionBudget({
      sessionId: id,
      action: "preview_access.rotated",
      limit: 20,
      windowMs: 60 * 60 * 1000
    });
    const rotated = await rotateResumeToken(id);
    const origin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : request.nextUrl.origin;
    const resumeUrl = `${origin}/studio/${id}#resume=${encodeURIComponent(rotated.resumeToken)}`;
    const response = dataResponse({ resumeUrl });
    const editorToken = request.cookies.get(sessionCookieName(id))?.value;
    if (editorToken) {
      response.cookies.set(sessionCookieName(id), editorToken, sessionCookieOptions(id, rotated.ttlSeconds));
    }
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

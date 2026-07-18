import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import {
  exchangeResumeToken,
  sessionCookieName,
  sessionCookieOptions
} from "@/domains/sessions/access-service";
import { getSessionOrThrow, serializeSession } from "@/domains/sessions/session-service";
import { resumeExchangeSchema } from "@/domains/sessions/validation";
import { consumeSessionActionBudget } from "@/domains/sessions/action-budget";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const { id } = await context.params;
    await getSessionOrThrow(id);
    const parsed = resumeExchangeSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid resume token", parsed.error.flatten());
    await consumeSessionActionBudget({
      sessionId: id,
      action: "preview_access.exchange_attempted",
      limit: 30,
      windowMs: 60 * 60 * 1000
    });
    const tokens = await exchangeResumeToken(id, parsed.data.resumeToken);
    const origin = process.env.APP_ORIGIN ?? request.nextUrl.origin;
    const resumeUrl = `${origin}/studio/${id}#resume=${encodeURIComponent(tokens.resumeToken)}`;
    const response = dataResponse({ session: await serializeSession(await getSessionOrThrow(id)), resumeUrl });
    response.cookies.set(sessionCookieName(id), tokens.editorToken, sessionCookieOptions(id, tokens.ttlSeconds));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

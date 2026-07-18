import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, clientAddress, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { hashClientAddress } from "@/domains/auth/security";
import { sessionCookieName, sessionCookieOptions } from "@/domains/sessions/access-service";
import { createSession, serializeSession } from "@/domains/sessions/session-service";
import { sessionCreateSchema } from "@/domains/sessions/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    let raw: unknown = {};
    if (request.headers.get("content-length") !== "0") {
      try {
        raw = await parseJson(request);
      } catch {
        raw = {};
      }
    }
    const parsed = sessionCreateSchema.safeParse(raw);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid session request", parsed.error.flatten());
    const created = await createSession(parsed.data.profileId, hashClientAddress(clientAddress(request)));
    const session = await serializeSession(created.row);
    const origin = process.env.APP_ORIGIN ?? request.nextUrl.origin;
    const resumeUrl = `${origin}/studio/${session.id}#resume=${encodeURIComponent(created.resumeToken)}`;
    const response = dataResponse({ session, resumeUrl }, { status: 201 });
    response.cookies.set(sessionCookieName(session.id), created.editorToken, sessionCookieOptions(session.id));
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

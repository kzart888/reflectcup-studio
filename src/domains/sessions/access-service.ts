import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db/client";
import { previewAccessTokens, previewSessions } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { ApiError } from "@/domains/auth/http";
import { createOpaqueToken, hashOpaqueToken } from "@/domains/auth/security";

export const DRAFT_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CONFIRMED_ACCESS_TTL_SECONDS = 90 * 24 * 60 * 60;

export function sessionCookieName(sessionId: string): string {
  return `${SESSION_COOKIE_NAME}_${sessionId.replaceAll("-", "")}`;
}

export function sessionCookieOptions(sessionId: string, maxAge = DRAFT_ACCESS_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/api/v1/preview-sessions/${sessionId}`,
    maxAge
  };
}

export async function issueInitialAccessTokens(
  previewSessionId: string,
  transaction = getDatabase(),
  ttlSeconds = DRAFT_ACCESS_TTL_SECONDS
): Promise<{ editorToken: string; resumeToken: string }> {
  const editorToken = createOpaqueToken();
  const resumeToken = createOpaqueToken();
  const now = Date.now();
  await transaction.insert(previewAccessTokens).values([
    {
      previewSessionId,
      tokenHash: hashOpaqueToken(editorToken),
      kind: "editor",
      expiresAt: new Date(now + ttlSeconds * 1000)
    },
    {
      previewSessionId,
      tokenHash: hashOpaqueToken(resumeToken),
      kind: "resume",
      expiresAt: new Date(now + ttlSeconds * 1000)
    }
  ]);
  return { editorToken, resumeToken };
}

export async function requirePreviewAccess(request: NextRequest, previewSessionId: string): Promise<void> {
  const token = request.cookies.get(sessionCookieName(previewSessionId))?.value;
  if (!token) throw new ApiError(401, "SESSION_ACCESS_REQUIRED", "This design requires its private access link");
  const record = await getDatabase().query.previewAccessTokens.findFirst({
    where: and(
      eq(previewAccessTokens.previewSessionId, previewSessionId),
      eq(previewAccessTokens.tokenHash, hashOpaqueToken(token)),
      eq(previewAccessTokens.kind, "editor"),
      isNull(previewAccessTokens.consumedAt),
      gt(previewAccessTokens.expiresAt, new Date())
    )
  });
  if (!record) throw new ApiError(401, "SESSION_ACCESS_INVALID", "This design access token is invalid or expired");
  const session = await getDatabase().query.previewSessions.findFirst({
    where: eq(previewSessions.id, previewSessionId)
  });
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
  if (session.status === "expired" || (session.expiresAt && session.expiresAt <= new Date())) {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(previewSessions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(previewSessions.id, previewSessionId));
      await transaction
        .update(previewAccessTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(previewAccessTokens.previewSessionId, previewSessionId), isNull(previewAccessTokens.consumedAt)));
    });
    throw new ApiError(410, "SESSION_EXPIRED", "This design has expired");
  }
  if (session.status === "draft") {
    await getDatabase().transaction(async (transaction) => {
      const touched = await transaction
        .update(previewSessions)
        .set({ expiresAt: new Date(Date.now() + DRAFT_ACCESS_TTL_SECONDS * 1000), updatedAt: new Date() })
        .where(and(eq(previewSessions.id, previewSessionId), eq(previewSessions.status, "draft")))
        .returning({ id: previewSessions.id });
      if (touched.length > 0) {
        await refreshSessionAccessExpiry(previewSessionId, DRAFT_ACCESS_TTL_SECONDS, transaction);
      }
    });
  }
}

export async function refreshSessionAccessExpiry(
  previewSessionId: string,
  ttlSeconds: number,
  transaction = getDatabase()
): Promise<void> {
  const target = new Date(Date.now() + ttlSeconds * 1000);
  await transaction
    .update(previewAccessTokens)
    .set({ expiresAt: sql`greatest(${previewAccessTokens.expiresAt}, ${target})` })
    .where(and(eq(previewAccessTokens.previewSessionId, previewSessionId), isNull(previewAccessTokens.consumedAt)));
}

export async function exchangeResumeToken(
  previewSessionId: string,
  resumeToken: string
): Promise<{ editorToken: string; resumeToken: string; ttlSeconds: number }> {
  return getDatabase().transaction(async (transaction) => {
    const [session] = await transaction
      .select()
      .from(previewSessions)
      .where(eq(previewSessions.id, previewSessionId))
      .for("update");
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
    if (session.status === "expired" || (session.expiresAt && session.expiresAt <= new Date())) {
      throw new ApiError(410, "SESSION_EXPIRED", "This design has expired");
    }
    const [consumed] = await transaction
      .update(previewAccessTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(previewAccessTokens.previewSessionId, previewSessionId),
          eq(previewAccessTokens.tokenHash, hashOpaqueToken(resumeToken)),
          eq(previewAccessTokens.kind, "resume"),
          isNull(previewAccessTokens.consumedAt),
          gt(previewAccessTokens.expiresAt, new Date())
        )
      )
      .returning({ id: previewAccessTokens.id });
    if (!consumed) throw new ApiError(401, "RESUME_TOKEN_INVALID", "Resume link is invalid, expired, or already used");

    await transaction
      .update(previewAccessTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(previewAccessTokens.previewSessionId, previewSessionId),
          eq(previewAccessTokens.kind, "editor"),
          isNull(previewAccessTokens.consumedAt)
        )
      );
    await transaction
      .delete(previewAccessTokens)
      .where(and(eq(previewAccessTokens.previewSessionId, previewSessionId), isNotNull(previewAccessTokens.consumedAt)));
    const ttlSeconds = session.status === "confirmed" ? CONFIRMED_ACCESS_TTL_SECONDS : DRAFT_ACCESS_TTL_SECONDS;
    return { ...(await issueInitialAccessTokens(previewSessionId, transaction, ttlSeconds)), ttlSeconds };
  });
}

/** Replaces every outstanding recovery link while preserving the current editor cookie. */
export async function rotateResumeToken(
  previewSessionId: string
): Promise<{ resumeToken: string; ttlSeconds: number }> {
  return getDatabase().transaction(async (transaction) => {
    const [session] = await transaction
      .select()
      .from(previewSessions)
      .where(eq(previewSessions.id, previewSessionId))
      .for("update");
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
    if (session.status === "expired" || (session.expiresAt && session.expiresAt <= new Date())) {
      throw new ApiError(410, "SESSION_EXPIRED", "This design has expired");
    }

    const ttlSeconds = session.status === "draft" ? DRAFT_ACCESS_TTL_SECONDS : CONFIRMED_ACCESS_TTL_SECONDS;
    const resumeToken = createOpaqueToken();
    await transaction
      .delete(previewAccessTokens)
      .where(
        and(
          eq(previewAccessTokens.previewSessionId, previewSessionId),
          eq(previewAccessTokens.kind, "resume")
        )
      );
    await transaction.insert(previewAccessTokens).values({
      previewSessionId,
      tokenHash: hashOpaqueToken(resumeToken),
      kind: "resume",
      expiresAt: new Date(Date.now() + ttlSeconds * 1000)
    });
    return { resumeToken, ttlSeconds };
  });
}

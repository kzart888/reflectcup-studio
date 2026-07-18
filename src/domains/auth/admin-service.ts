import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDatabase } from "@/db/client";
import { adminSessions, adminUsers, auditLogs, type AdminRole } from "@/db/schema";
import { ADMIN_COOKIE_NAME } from "@/lib/constants";
import {
  findAdminByEmail,
  findAdminSession,
  markAdminLoginAttemptSucceeded,
  reserveAdminLoginAttempt
} from "@/repositories/admin";
import { ApiError, clientAddress } from "@/domains/auth/http";
import { runArgon2Work } from "@/domains/auth/password-work-gate";
import {
  consumeComparablePasswordWork,
  createOpaqueToken,
  hashClientAddress,
  hashOpaqueToken,
  normalizeEmail,
  verifyPassword
} from "@/domains/auth/security";

const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const ROLE_WEIGHT: Record<AdminRole, number> = { viewer: 0, operator: 1, owner: 2 };

export type AdminPrincipal = {
  id: string;
  email: string;
  role: AdminRole;
  mustChangePassword: boolean;
  sessionId: string;
};

export async function loginAdmin(
  email: string,
  password: string,
  address: string
): Promise<{ principal: AdminPrincipal; token: string; maxAge: number }> {
  const normalizedEmail = normalizeEmail(email);
  const ipHash = hashClientAddress(address);
  const reservation = await reserveAdminLoginAttempt(normalizedEmail, ipHash);
  if (!reservation.allowed) {
    throw new ApiError(429, "LOGIN_RATE_LIMITED", "Too many failed login attempts. Try again later.");
  }

  const user = await findAdminByEmail(normalizedEmail);
  const valid = await runArgon2Work(async () => {
    if (!user) {
      await consumeComparablePasswordWork(password);
      return false;
    }
    return verifyPassword(user.passwordHash, password);
  });

  if (!user || !valid || !user.enabled) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  await markAdminLoginAttemptSucceeded(reservation.attemptId);

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  const [session] = await getDatabase()
    .insert(adminSessions)
    .values({ adminUserId: user.id, tokenHash: hashOpaqueToken(token), expiresAt })
    .returning();
  await getDatabase().update(adminUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(adminUsers.id, user.id));
  await writeAudit({
    actorAdminUserId: user.id,
    action: "admin.login",
    targetType: "admin_user",
    targetId: user.id,
    ipHash
  });

  return {
    principal: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      sessionId: session.id
    },
    token,
    maxAge: ADMIN_SESSION_TTL_SECONDS
  };
}

export async function authenticateAdmin(request: NextRequest): Promise<AdminPrincipal> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) throw new ApiError(401, "ADMIN_AUTH_REQUIRED", "Administrator authentication is required");
  const result = await findAdminSession(hashOpaqueToken(token));
  if (!result) throw new ApiError(401, "ADMIN_SESSION_INVALID", "Administrator session is invalid or expired");
  const passwordSetupPath = request.nextUrl.pathname.endsWith("/me") || request.nextUrl.pathname.endsWith("/me/password");
  const logoutPath = request.nextUrl.pathname.endsWith("/auth/logout");
  if (result.adminUser.mustChangePassword && !passwordSetupPath && !logoutPath) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Change the initial password before continuing");
  }

  return {
    id: result.adminUser.id,
    email: result.adminUser.email,
    role: result.adminUser.role,
    mustChangePassword: result.adminUser.mustChangePassword,
    sessionId: result.adminSession.id
  };
}

export function requireRole(principal: AdminPrincipal, minimum: AdminRole): void {
  if (ROLE_WEIGHT[principal.role] < ROLE_WEIGHT[minimum]) {
    throw new ApiError(403, "INSUFFICIENT_ROLE", `The ${minimum} role is required`);
  }
}

export async function logoutAdmin(request: NextRequest, principal: AdminPrincipal): Promise<void> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (token) {
    await getDatabase().delete(adminSessions).where(
      and(eq(adminSessions.id, principal.sessionId), eq(adminSessions.tokenHash, hashOpaqueToken(token)))
    );
  }
  await writeAudit({
    actorAdminUserId: principal.id,
    action: "admin.logout",
    targetType: "admin_user",
    targetId: principal.id,
    ipHash: hashClientAddress(clientAddress(request))
  });
}

export async function writeAudit(input: {
  actorAdminUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  requestId?: string;
  ipHash?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDatabase().insert(auditLogs).values(input);
}

export function adminCookieOptions(maxAge = ADMIN_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1",
    maxAge
  };
}

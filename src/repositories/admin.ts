import { and, eq, gt, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { adminSessions, adminUsers, loginAttempts } from "@/db/schema";

export async function findAdminByEmail(normalizedEmail: string) {
  return getDatabase().query.adminUsers.findFirst({
    where: sql`lower(${adminUsers.email}) = ${normalizedEmail}`
  });
}

export async function findAdminSession(tokenHash: string) {
  const [result] = await getDatabase()
    .select({ adminSession: adminSessions, adminUser: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(
      and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, new Date()), eq(adminUsers.enabled, true))
    )
    .limit(1);
  return result;
}

export const ADMIN_LOGIN_LIMITS = {
  email: { attempts: 5, windowMs: 15 * 60 * 1000 },
  ip: { attempts: 20, windowMs: 60 * 60 * 1000 }
} as const;

export type AdminLoginReservation =
  | { allowed: true; attemptId: string }
  | { allowed: false; scope: "email" | "ip" };

/**
 * Reserves a failed login row before any password hashing occurs.
 *
 * Transaction-scoped advisory locks serialize all reservations for either the
 * email address or client IP. This makes the check-and-insert atomic across
 * processes and prevents concurrent requests from all slipping through the
 * same remaining budget.
 */
export async function reserveAdminLoginAttempt(
  normalizedEmail: string,
  ipHash: string,
  now = new Date()
): Promise<AdminLoginReservation> {
  const emailSince = new Date(now.getTime() - ADMIN_LOGIN_LIMITS.email.windowMs);
  const ipSince = new Date(now.getTime() - ADMIN_LOGIN_LIMITS.ip.windowMs);

  return getDatabase().transaction(async (transaction) => {
    const lockNames = [`email:${normalizedEmail}`, `ip:${ipHash}`].sort();
    for (const lockName of lockNames) {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`reflectcup:admin-login:${lockName}`}, 0))`
      );
    }

    const [counts] = await transaction
      .select({
        email: sql<number>`count(*) filter (
          where ${loginAttempts.normalizedEmail} = ${normalizedEmail}
            and ${loginAttempts.createdAt} > ${emailSince}
        )::int`,
        ip: sql<number>`count(*) filter (
          where ${loginAttempts.ipHash} = ${ipHash}
            and ${loginAttempts.createdAt} > ${ipSince}
        )::int`
      })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.succeeded, false),
          or(
            and(eq(loginAttempts.normalizedEmail, normalizedEmail), gt(loginAttempts.createdAt, emailSince)),
            and(eq(loginAttempts.ipHash, ipHash), gt(loginAttempts.createdAt, ipSince))
          )
        )
      );

    if ((counts?.email ?? 0) >= ADMIN_LOGIN_LIMITS.email.attempts) {
      return { allowed: false, scope: "email" };
    }
    if ((counts?.ip ?? 0) >= ADMIN_LOGIN_LIMITS.ip.attempts) {
      return { allowed: false, scope: "ip" };
    }

    const [attempt] = await transaction
      .insert(loginAttempts)
      .values({ normalizedEmail, ipHash, succeeded: false, createdAt: now })
      .returning({ id: loginAttempts.id });
    return { allowed: true, attemptId: attempt.id };
  });
}

export async function markAdminLoginAttemptSucceeded(attemptId: string): Promise<void> {
  await getDatabase().update(loginAttempts).set({ succeeded: true }).where(eq(loginAttempts.id, attemptId));
}

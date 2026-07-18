import { and, count, eq, gte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { ApiError } from "@/domains/auth/http";

/** Consumes a database-serialized per-session budget before expensive work. */
export async function consumeSessionActionBudget(input: {
  sessionId: string;
  action:
    | "preview_source.attempted"
    | "preview_render.attempted"
    | "preview_access.exchange_attempted"
    | "preview_access.rotated";
  limit: number;
  windowMs: number;
}): Promise<void> {
  await getDatabase().transaction(async (transaction) => {
    const lockKey = `${input.action}:${input.sessionId}`;
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [recent] = await transaction
      .select({ value: count() })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, input.action),
        eq(auditLogs.targetId, input.sessionId),
        gte(auditLogs.createdAt, new Date(Date.now() - input.windowMs))
      ));
    if (Number(recent?.value ?? 0) >= input.limit) {
      throw new ApiError(429, "SESSION_ACTION_RATE_LIMITED", "This design is updating too frequently. Try again later.");
    }
    await transaction.insert(auditLogs).values({
      action: input.action,
      targetType: "preview_session",
      targetId: input.sessionId,
      metadata: { limit: input.limit, windowMs: input.windowMs }
    });
  });
}

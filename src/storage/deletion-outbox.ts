import { and, asc, count, eq, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { storageDeletionOutbox } from "@/db/schema";
import { getStorage } from "@/storage/filesystem-storage";
import type { StorageAdapter } from "@/storage/storage-adapter";

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const INITIAL_RETRY_DELAY_MS = 10 * 1000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

export type StorageDeletionIntent = {
  storageKey: string;
  reason: string;
};

export type StorageDeletionDrainResult = {
  claimed: number;
  completed: number;
  failed: number;
};

export function storageDeletionValues(intents: readonly StorageDeletionIntent[]) {
  const now = new Date();
  return [...new Map(
    intents.map((intent) => [intent.storageKey, {
      storageKey: intent.storageKey,
      reason: intent.reason.slice(0, 200),
      nextAttemptAt: now,
      updatedAt: now
    }])
  ).values()];
}

export function storageDeletionConflictClause() {
  return {
    target: storageDeletionOutbox.storageKey,
    set: {
      reason: sql`excluded.reason`,
      attempts: 0,
      nextAttemptAt: sql`excluded.next_attempt_at`,
      lastError: null,
      completedAt: null,
      updatedAt: sql`excluded.updated_at`
    },
    // A duplicate pending intent already has a worker lease or retry schedule.
    // Only resurrect a completed tombstone if a key is deliberately reused.
    setWhere: isNotNull(storageDeletionOutbox.completedAt)
  };
}

/**
 * Used when an object was persisted before its asset row could be inserted.
 * Normal asset replacement/retention paths enqueue in their existing database
 * transaction instead, so asset deletion and the tombstone commit atomically.
 */
export async function enqueueStorageDeletions(intents: readonly StorageDeletionIntent[]): Promise<void> {
  const values = storageDeletionValues(intents);
  if (values.length === 0) return;
  await getDatabase()
    .insert(storageDeletionOutbox)
    .values(values)
    .onConflictDoUpdate(storageDeletionConflictClause());
}

function retryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** Math.min(16, Math.max(0, attempts - 1)));
}

/**
 * Claims due tombstones with SKIP LOCKED, leases them outside the transaction,
 * and performs idempotent storage deletes. A crash after deleting the object but
 * before marking completion is safe: the next attempt sees an already-absent
 * object and completes the same tombstone.
 */
export async function processStorageDeletionOutbox(options: {
  now?: Date;
  limit?: number;
  storage?: Pick<StorageAdapter, "delete">;
} = {}): Promise<StorageDeletionDrainResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  const storage = options.storage ?? getStorage();
  const claimed = await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select()
      .from(storageDeletionOutbox)
      .where(and(isNull(storageDeletionOutbox.completedAt), lte(storageDeletionOutbox.nextAttemptAt, now)))
      .orderBy(asc(storageDeletionOutbox.nextAttemptAt), asc(storageDeletionOutbox.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];
    const ids = candidates.map((candidate) => candidate.id);
    await transaction
      .update(storageDeletionOutbox)
      .set({
        attempts: sql`${storageDeletionOutbox.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
        updatedAt: now
      })
      .where(and(inArray(storageDeletionOutbox.id, ids), isNull(storageDeletionOutbox.completedAt)));
    return candidates.map((candidate) => ({ ...candidate, attempts: candidate.attempts + 1 }));
  });

  let completed = 0;
  let failed = 0;
  await Promise.all(claimed.map(async (intent) => {
    try {
      await storage.delete(intent.storageKey);
      const persisted = await getDatabase()
        .update(storageDeletionOutbox)
        .set({ completedAt: now, lastError: null, updatedAt: now })
        .where(and(eq(storageDeletionOutbox.id, intent.id), isNull(storageDeletionOutbox.completedAt)))
        .returning({ id: storageDeletionOutbox.id });
      completed += persisted.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage deletion failure";
      const persisted = await getDatabase()
        .update(storageDeletionOutbox)
        .set({
          lastError: message.slice(0, 1000),
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(intent.attempts)),
          updatedAt: now
        })
        .where(and(eq(storageDeletionOutbox.id, intent.id), isNull(storageDeletionOutbox.completedAt)))
        .returning({ id: storageDeletionOutbox.id });
      failed += persisted.length;
    }
  }));

  return { claimed: claimed.length, completed, failed };
}

export async function countPendingStorageDeletions(storageKeys: readonly string[]): Promise<number> {
  if (storageKeys.length === 0) return 0;
  const [row] = await getDatabase()
    .select({ value: count() })
    .from(storageDeletionOutbox)
    .where(and(inArray(storageDeletionOutbox.storageKey, [...new Set(storageKeys)]), isNull(storageDeletionOutbox.completedAt)));
  return Number(row?.value ?? 0);
}

export async function purgeCompletedStorageDeletions(
  completedBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  limit = 1000
): Promise<number> {
  const candidates = await getDatabase()
    .select({ id: storageDeletionOutbox.id })
    .from(storageDeletionOutbox)
    .where(and(isNotNull(storageDeletionOutbox.completedAt), lt(storageDeletionOutbox.completedAt, completedBefore)))
    .orderBy(asc(storageDeletionOutbox.completedAt))
    .limit(Math.max(1, Math.min(5000, limit)));
  if (candidates.length === 0) return 0;
  await getDatabase()
    .delete(storageDeletionOutbox)
    .where(inArray(storageDeletionOutbox.id, candidates.map((candidate) => candidate.id)));
  return candidates.length;
}

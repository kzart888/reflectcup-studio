import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  assets,
  auditLogs,
  designSnapshots,
  previewAccessTokens,
  previewSessions,
  productionArtifacts,
  renderJobs,
  storageDeletionOutbox
} from "@/db/schema";
import {
  countPendingStorageDeletions,
  processStorageDeletionOutbox,
  storageDeletionConflictClause,
  storageDeletionValues
} from "@/storage/deletion-outbox";
import type { StorageAdapter } from "@/storage/storage-adapter";

export type ExpirationResult = { sessionId: string; removedAssets: number; storageFailures: number };

/**
 * Expires inaccessible drafts/confirmed-without-commerce sessions and removes
 * their private binaries. Audit metadata retains only snapshot checksums.
 */
export async function expireStaleSessions(
  now = new Date(),
  limit = 100,
  storage?: Pick<StorageAdapter, "delete">
): Promise<ExpirationResult[]> {
  const candidates = await getDatabase().query.previewSessions.findMany({
    where: and(
      inArray(previewSessions.status, ["draft", "confirmed", "expired"]),
      lte(previewSessions.expiresAt, now)
    ),
    orderBy: [asc(previewSessions.expiresAt)],
    limit
  });
  const results: ExpirationResult[] = [];
  for (const candidate of candidates) {
    const stored = await getDatabase().transaction(async (transaction) => {
      const [session] = await transaction
        .select()
        .from(previewSessions)
        .where(eq(previewSessions.id, candidate.id))
        .for("update");
      if (
        !session ||
        !["draft", "confirmed", "expired"].includes(session.status) ||
        !session.expiresAt ||
        session.expiresAt > now
      ) return [];

      const snapshots = await transaction.query.designSnapshots.findMany({
        where: eq(designSnapshots.previewSessionId, session.id)
      });
      const snapshotIds = snapshots.map((snapshot) => snapshot.id);
      const [jobs, artifactsForProduction] = await Promise.all([
        transaction.query.renderJobs.findMany({ where: eq(renderJobs.previewSessionId, session.id) }),
        snapshotIds.length > 0
          ? transaction.query.productionArtifacts.findMany({
              where: inArray(productionArtifacts.snapshotId, snapshotIds)
            })
          : []
      ]);
      const assetIds = [...new Set([
        session.sourceAssetId,
        session.previewAssetId,
        ...snapshots.flatMap((snapshot) => [snapshot.sourceAssetId, snapshot.previewAssetId]),
        ...jobs.map((job) => job.outputAssetId),
        ...artifactsForProduction.map((artifact) => artifact.bundleAssetId)
      ].filter((id): id is string => Boolean(id)))];
      const storedAssets = assetIds.length > 0
        ? await transaction.select().from(assets).where(inArray(assets.id, assetIds))
        : [];

      if (snapshotIds.length > 0) {
        await transaction.delete(productionArtifacts).where(inArray(productionArtifacts.snapshotId, snapshotIds));
      }
      await transaction.delete(renderJobs).where(eq(renderJobs.previewSessionId, session.id));
      await transaction.delete(designSnapshots).where(eq(designSnapshots.previewSessionId, session.id));
      await transaction.delete(previewAccessTokens).where(eq(previewAccessTokens.previewSessionId, session.id));
      await transaction
        .update(previewSessions)
        .set({ status: "expired", sourceAssetId: null, previewAssetId: null, expiresAt: null, updatedAt: now })
        .where(eq(previewSessions.id, session.id));
      if (storedAssets.length > 0) {
        await transaction
          .insert(storageDeletionOutbox)
          .values(storageDeletionValues(storedAssets.map((asset) => ({
            storageKey: asset.storageKey,
            reason: "session_retention_expired"
          }))))
          .onConflictDoUpdate(storageDeletionConflictClause());
        await transaction.delete(assets).where(inArray(assets.id, storedAssets.map((asset) => asset.id)));
      }
      await transaction.insert(auditLogs).values({
        action: "preview_session.expired",
        targetType: "preview_session",
        targetId: session.id,
        metadata: {
          previousStatus: session.status,
          snapshotChecksums: snapshots.map((snapshot) => snapshot.checksum),
          removedAssets: storedAssets.length
        }
      });
      return storedAssets;
    });
    const storageKeys = stored.map((asset) => asset.storageKey);
    await processStorageDeletionOutbox({ limit: Math.max(20, stored.length), storage }).catch((error: unknown) => {
      console.error("Expired session objects remain queued for retry", error);
    });
    results.push({
      sessionId: candidate.id,
      removedAssets: stored.length,
      storageFailures: await countPendingStorageDeletions(storageKeys)
    });
  }
  return results;
}

import { desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { designSnapshots, previewSessions } from "@/db/schema";

export async function findPreviewSession(id: string) {
  return getDatabase().query.previewSessions.findFirst({ where: eq(previewSessions.id, id) });
}

export async function listPreviewSessions(limit = 100) {
  return getDatabase().query.previewSessions.findMany({
    orderBy: [desc(previewSessions.updatedAt)],
    limit
  });
}

export async function findLatestSnapshotsForSessions(sessionIds: readonly string[]) {
  if (sessionIds.length === 0) return new Map<string, typeof designSnapshots.$inferSelect>();
  const rows = await getDatabase()
    .select()
    .from(designSnapshots)
    .where(inArray(designSnapshots.previewSessionId, [...sessionIds]))
    .orderBy(desc(designSnapshots.revision), desc(designSnapshots.createdAt));
  const latest = new Map<string, typeof designSnapshots.$inferSelect>();
  for (const row of rows) {
    if (!latest.has(row.previewSessionId)) latest.set(row.previewSessionId, row);
  }
  return latest;
}

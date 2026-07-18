import { NextRequest } from "next/server";

import { authenticateAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, dataResponse } from "@/domains/auth/http";
import { serializeAdminSession } from "@/domains/sessions/session-service";
import { findLatestSnapshotsForSessions, listPreviewSessions } from "@/repositories/preview-sessions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const rows = await listPreviewSessions(100);
    const [serialized, latestSnapshots] = await Promise.all([
      Promise.all(rows.map(serializeAdminSession)),
      findLatestSnapshotsForSessions(rows.map((row) => row.id))
    ]);
    return dataResponse({
      sessions: serialized.map((session) => {
        const snapshot = latestSnapshots.get(session.id);
        return {
          ...session,
          snapshotId: snapshot?.id ?? null,
          snapshotRevision: snapshot?.revision ?? null,
          snapshotChecksum: snapshot?.checksum ?? null
        };
      })
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

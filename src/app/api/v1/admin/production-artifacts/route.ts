import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productionArtifacts } from "@/db/schema";
import { localRenderExecutor } from "@/domains/artifacts/render-executor";
import { serializeRenderJob } from "@/domains/artifacts/render-service";
import { authenticateAdmin, requireRole, writeAudit } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { findAsset } from "@/repositories/assets";

export const runtime = "nodejs";

const schema = z.object({ snapshotId: z.uuid() }).strict();

export async function GET(request: NextRequest) {
  try {
    await authenticateAdmin(request);
    const rows = await getDatabase().query.productionArtifacts.findMany({
      orderBy: [desc(productionArtifacts.createdAt)],
      limit: 100
    });
    const artifacts = await Promise.all(
      rows.map(async (row) => {
        const bundle = row.bundleAssetId ? await findAsset(row.bundleAssetId) : undefined;
        return {
          id: row.id,
          snapshotId: row.snapshotId,
          renderJobId: row.renderJobId,
          checksum: row.checksum,
          manifest: row.manifest,
          bundle: bundle
            ? { id: bundle.id, url: `/api/v1/assets/${bundle.id}`, mimeType: bundle.mimeType, sha256: bundle.sha256 }
            : undefined,
          createdAt: row.createdAt.toISOString()
        };
      })
    );
    return dataResponse({ artifacts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    const principal = await authenticateAdmin(request);
    requireRole(principal, "operator");
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid production artifact request", parsed.error.flatten());
    const job = await localRenderExecutor.queueProduction(parsed.data.snapshotId, principal.id);
    await writeAudit({
      actorAdminUserId: principal.id,
      action: "production_bundle.queued",
      targetType: "render_job",
      targetId: job.id,
      metadata: { snapshotId: parsed.data.snapshotId }
    });
    return dataResponse({ job: await serializeRenderJob(job) }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

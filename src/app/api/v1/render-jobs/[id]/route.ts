import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDatabase } from "@/db/client";
import { renderJobs } from "@/db/schema";
import { serializeRenderJob } from "@/domains/artifacts/render-service";
import { authenticateAdmin } from "@/domains/auth/admin-service";
import { apiErrorResponse, ApiError, dataResponse } from "@/domains/auth/http";
import { requirePreviewAccess } from "@/domains/sessions/access-service";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const job = await getDatabase().query.renderJobs.findFirst({ where: eq(renderJobs.id, id) });
    if (!job) throw new ApiError(404, "RENDER_JOB_NOT_FOUND", "Render job was not found");
    if (job.kind === "production_bundle") await authenticateAdmin(request);
    else await requirePreviewAccess(request, job.previewSessionId);
    return dataResponse({ job: await serializeRenderJob(job) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

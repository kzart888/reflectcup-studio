import { NextRequest } from "next/server";

import { apiErrorResponse, ApiError, dataResponse, enforceSameOrigin, parseJson } from "@/domains/auth/http";
import { localRenderExecutor } from "@/domains/artifacts/render-executor";
import { serializeRenderJob } from "@/domains/artifacts/render-service";
import { requirePreviewAccess } from "@/domains/sessions/access-service";
import { consumeSessionActionBudget } from "@/domains/sessions/action-budget";
import { revisionSchema } from "@/domains/sessions/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    enforceSameOrigin(request);
    const { id } = await context.params;
    await requirePreviewAccess(request, id);
    await consumeSessionActionBudget({
      sessionId: id,
      action: "preview_render.attempted",
      limit: 120,
      windowMs: 60 * 60 * 1000
    });
    const parsed = revisionSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid render request", parsed.error.flatten());
    const result = await localRenderExecutor.renderPreview(id, parsed.data.revision);
    return dataResponse({ job: await serializeRenderJob(result.job) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

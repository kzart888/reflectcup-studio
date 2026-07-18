import { createPreviewRender, queueProductionBundle } from "@/domains/artifacts/render-service";

/**
 * Deployment seam for authoritative rendering. Preview work is synchronous;
 * production work only creates a durable queue row. The separately deployed
 * production worker claims that row and runs the 4K path in a worker thread.
 */
export interface RenderExecutor {
  renderPreview(sessionId: string, revision: number): ReturnType<typeof createPreviewRender>;
  queueProduction(snapshotId: string, actorAdminUserId: string): ReturnType<typeof queueProductionBundle>;
}

export const localRenderExecutor: RenderExecutor = {
  renderPreview: createPreviewRender,
  queueProduction: queueProductionBundle
};

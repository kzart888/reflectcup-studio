import { randomUUID } from "node:crypto";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";

import { getDatabase } from "@/db/client";
import {
  assets,
  designSnapshots,
  opticalProfiles,
  previewSessions,
  productionArtifacts,
  renderJobs,
  storageDeletionOutbox
} from "@/db/schema";
import { PRODUCTION_SIZE, PREVIEW_SIZE } from "@/lib/constants";
import type { RenderJob } from "@/lib/contracts";
import { ApiError } from "@/domains/auth/http";
import { sha256, stableJson } from "@/domains/auth/security";
import { validateStoredOpticalProfile } from "@/domains/profiles/profile-service";
import { deriveProductionPrintMetrics } from "@/domains/artifacts/print-metrics";
import { decodeSourceImage, encodeRgbaPng, renderCanonicalPlatePng } from "@/optics/server/image";
import { generateTargetPlateMap, renderCanonicalPlate, renderOpticalProof } from "@/optics";
import type { OpticalProfile, PlateTargetLut } from "@/optics";
import { findAsset, insertAsset } from "@/repositories/assets";
import { getStorage } from "@/storage/filesystem-storage";
import {
  enqueueStorageDeletions,
  processStorageDeletionOutbox,
  storageDeletionConflictClause,
  storageDeletionValues
} from "@/storage/deletion-outbox";
import { WorkGate } from "@/lib/work-gate";

const previewRenderGate = new WorkGate(2, 6, "PREVIEW_RENDER_CAPACITY_EXCEEDED");
const productionRenderGate = new WorkGate(1, 2, "PRODUCTION_RENDER_CAPACITY_EXCEEDED");

export type ProductionExecutionResult = "ready" | "failed" | "not_claimed";

export interface ProductionExecutionHooks {
  /**
   * Runs immediately after the queued -> running compare-and-set succeeds.
   * The dedicated worker uses this signal to maintain a heartbeat from its
   * parent thread while the CPU-bound child cannot service timers.
   */
  onClaim?: (leaseToken: string) => void;
}

export async function markProductionJobFailed(jobId: string, error: unknown, leaseToken?: string): Promise<void> {
  const activeClaim = and(
    eq(renderJobs.id, jobId),
    or(eq(renderJobs.status, "queued"), eq(renderJobs.status, "running")),
    leaseToken ? sql`${renderJobs.input}->>'leaseToken' = ${leaseToken}` : undefined
  );
  await getDatabase()
    .update(renderJobs)
    .set({
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown production error",
      input: sql`${renderJobs.input} - 'leaseToken'`,
      updatedAt: new Date()
    })
    .where(activeClaim);
}

async function loadLut(profile: typeof opticalProfiles.$inferSelect): Promise<{
  lut: PlateTargetLut;
  opticalProfile: OpticalProfile;
}> {
  const runtime = await validateStoredOpticalProfile(profile);
  const opticalProfile = runtime.document;
  const [width, height] = opticalProfile.mapping.lutSize;
  const copied = Uint8Array.from(runtime.lutBytes);
  return {
    opticalProfile,
    lut: {
      width,
      height,
      targetUv: new Float32Array(copied.buffer),
      validMask: Uint8Array.from(runtime.maskBytes)
    }
  };
}

async function loadRenderInput(session: typeof previewSessions.$inferSelect) {
  if (!session.sourceAssetId) throw new ApiError(409, "SOURCE_REQUIRED", "Upload an image before rendering");
  const [profile, sourceAsset] = await Promise.all([
    getDatabase().query.opticalProfiles.findFirst({ where: eq(opticalProfiles.id, session.opticalProfileId) }),
    findAsset(session.sourceAssetId)
  ]);
  if (!profile || !sourceAsset) throw new ApiError(500, "RENDER_INPUT_MISSING", "A render input asset is missing");
  const [opticalRuntime, sourceBytes] = await Promise.all([loadLut(profile), getStorage().get(sourceAsset.storageKey)]);
  const source = await decodeSourceImage(Buffer.from(sourceBytes));
  return { profile, opticalProfile: opticalRuntime.opticalProfile, sourceAsset, lut: opticalRuntime.lut, source };
}

async function storeGeneratedAsset(input: {
  sessionId?: string;
  kind: string;
  extension: string;
  mimeType: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}) {
  const digest = sha256(input.bytes);
  if (input.sessionId) {
    const existing = await getDatabase().query.assets.findFirst({
      where: and(eq(assets.ownerSessionId, input.sessionId), eq(assets.kind, input.kind), eq(assets.sha256, digest))
    });
    if (existing) return { asset: existing, created: false };
  }
  const key = `${input.sessionId ? `sessions/${input.sessionId}` : "production"}/${input.kind}/${randomUUID()}.${input.extension}`;
  await getStorage().put(key, input.bytes);
  try {
    const asset = await insertAsset({
      ownerSessionId: input.sessionId,
      kind: input.kind,
      storageKey: key,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      width: input.width,
      height: input.height,
      sha256: digest,
      metadata: input.metadata ?? {}
    });
    return { asset, created: true };
  } catch (error) {
    await enqueueStorageDeletions([{ storageKey: key, reason: "generated_asset_insert_failed" }])
      .then(() => processStorageDeletionOutbox({ limit: 20 }))
      .catch(async (cleanupError: unknown) => {
        console.error("Generated object cleanup could not be queued", cleanupError);
        await getStorage().delete(key).catch(() => undefined);
      });
    throw error;
  }
}

async function createPreviewRenderInternal(sessionId: string, revision: number) {
  const session = await getDatabase().query.previewSessions.findFirst({ where: eq(previewSessions.id, sessionId) });
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
  if (session.status !== "draft") throw new ApiError(409, "SESSION_NOT_EDITABLE", "Confirmed designs cannot be rendered as drafts");
  if (session.revision !== revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "A newer version of this design exists", { revision: session.revision });
  }
  const [job] = await getDatabase()
    .insert(renderJobs)
    .values({ previewSessionId: sessionId, kind: "preview", status: "running", progress: 10, input: { revision } })
    .returning();
  try {
    const { source, lut, profile } = await loadRenderInput(session);
    const png = await renderCanonicalPlatePng({ size: PREVIEW_SIZE, crop: session.crop, source, lut });
    const stored = await storeGeneratedAsset({
      sessionId,
      kind: "preview",
      extension: "png",
      mimeType: "image/png",
      bytes: png,
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      metadata: { revision, profileChecksum: profile.checksum }
    });
    const asset = stored.asset;
    let stalePreview: typeof assets.$inferSelect | undefined;
    const updatedSession = await getDatabase().transaction(async (transaction) => {
      const [updated] = await transaction
        .update(previewSessions)
        .set({ previewAssetId: asset.id, updatedAt: new Date() })
        .where(and(eq(previewSessions.id, sessionId), eq(previewSessions.revision, revision), eq(previewSessions.status, "draft")))
        .returning();
      if (!updated) return undefined;
      if (session.previewAssetId && session.previewAssetId !== asset.id) {
        stalePreview = await transaction.query.assets.findFirst({
          where: and(
            eq(assets.id, session.previewAssetId),
            eq(assets.ownerSessionId, sessionId),
            eq(assets.kind, "preview")
          )
        });
        if (stalePreview) {
          await transaction
            .insert(storageDeletionOutbox)
            .values(storageDeletionValues([{
              storageKey: stalePreview.storageKey,
              reason: "preview_replaced"
            }]))
            .onConflictDoUpdate(storageDeletionConflictClause());
          await transaction.delete(assets).where(eq(assets.id, stalePreview.id));
        }
      }
      return updated;
    });
    if (!updatedSession) {
      if (stored.created) {
        await getDatabase().transaction(async (transaction) => {
          await transaction
            .insert(storageDeletionOutbox)
            .values(storageDeletionValues([{
              storageKey: asset.storageKey,
              reason: "preview_render_superseded"
            }]))
            .onConflictDoUpdate(storageDeletionConflictClause());
          await transaction.delete(assets).where(eq(assets.id, asset.id));
        }).then(() => processStorageDeletionOutbox({ limit: 20 })).catch((cleanupError: unknown) => {
          console.error("Superseded preview object cleanup could not be queued", cleanupError);
        });
      }
      throw new ApiError(409, "RENDER_SUPERSEDED", "The design changed while its preview was rendering");
    }
    if (stalePreview) {
      await processStorageDeletionOutbox({ limit: 20 }).catch((cleanupError: unknown) => {
        console.error("Superseded preview object remains queued for retry", cleanupError);
      });
    }
    const [readyJob] = await getDatabase()
      .update(renderJobs)
      .set({ status: "ready", progress: 100, outputAssetId: asset.id, updatedAt: new Date() })
      .where(eq(renderJobs.id, job.id))
      .returning();
    return { job: readyJob, session: updatedSession, asset };
  } catch (error) {
    await getDatabase()
      .update(renderJobs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown rendering error",
        updatedAt: new Date()
      })
      .where(eq(renderJobs.id, job.id));
    throw error;
  }
}

export function createPreviewRender(sessionId: string, revision: number) {
  return previewRenderGate.run(() => createPreviewRenderInternal(sessionId, revision));
}

export async function queueProductionBundle(snapshotId: string, actorAdminUserId: string) {
  const snapshot = await getDatabase().query.designSnapshots.findFirst({ where: eq(designSnapshots.id, snapshotId) });
  if (!snapshot) throw new ApiError(404, "SNAPSHOT_NOT_FOUND", "Confirmed design snapshot was not found");
  const [job] = await getDatabase()
    .insert(renderJobs)
    .values({
      previewSessionId: snapshot.previewSessionId,
      snapshotId,
      kind: "production_bundle",
      status: "queued",
      progress: 0,
      input: { size: PRODUCTION_SIZE, actorAdminUserId }
    })
    .returning();
  return job;
}

async function executeProductionBundleInternal(
  jobId: string,
  actorAdminUserId: string,
  hooks: ProductionExecutionHooks = {}
): Promise<ProductionExecutionResult> {
  let job: typeof renderJobs.$inferSelect | undefined;
  let leaseToken: string | undefined;
  try {
    const candidate = await getDatabase().query.renderJobs.findFirst({
      where: and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.kind, "production_bundle"),
        eq(renderJobs.status, "queued")
      )
    });
    if (!candidate) return "not_claimed";
    if (!candidate.snapshotId) {
      await markProductionJobFailed(jobId, new Error("Production job is missing its immutable snapshot"));
      return "failed";
    }
    const queuedActor = (candidate.input as { actorAdminUserId?: unknown }).actorAdminUserId;
    if (queuedActor !== actorAdminUserId) {
      await markProductionJobFailed(jobId, new Error("Production job administrator provenance does not match"));
      return "failed";
    }
    leaseToken = randomUUID();
    [job] = await getDatabase()
      .update(renderJobs)
      .set({
        status: "running",
        progress: 5,
        input: { ...candidate.input, leaseToken },
        updatedAt: new Date()
      })
      .where(and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.kind, "production_bundle"),
        eq(renderJobs.status, "queued")
      ))
      .returning();
    if (!job?.snapshotId) return "not_claimed";
    hooks.onClaim?.(leaseToken);
    const claimedJob = job;
    const snapshot = await getDatabase().query.designSnapshots.findFirst({ where: eq(designSnapshots.id, claimedJob.snapshotId!) });
    if (!snapshot) throw new Error("Snapshot disappeared before production rendering");
    const session = await getDatabase().query.previewSessions.findFirst({ where: eq(previewSessions.id, snapshot.previewSessionId) });
    if (!session) throw new Error("Preview session disappeared before production rendering");
    const snapshotCrop = (snapshot.design.crop ?? session.crop) as typeof session.crop;
    const { source, lut, profile, opticalProfile } = await loadRenderInput({
      ...session,
      crop: snapshotCrop,
      sourceAssetId: snapshot.sourceAssetId,
      opticalProfileId: snapshot.opticalProfileId
    });
    const frozenProfile = (snapshot.design as Record<string, unknown>).opticalProfile as
      | { id?: string; slug?: string; version?: number; checksum?: string; generatorVersion?: string; geometryChecksum?: string; lutChecksum?: string }
      | undefined;
    if (
      !frozenProfile ||
      frozenProfile.id !== profile.id ||
      frozenProfile.version !== profile.version ||
      frozenProfile.checksum !== profile.checksum
    ) {
      throw new Error("Snapshot optical-profile provenance no longer matches the immutable profile record");
    }
    const plateRaw = renderCanonicalPlate({ size: PRODUCTION_SIZE, crop: snapshotCrop, source, lut });
    const { dishDiameterMm, exactPpi, pngDensityPpi } = deriveProductionPrintMetrics(opticalProfile, PRODUCTION_SIZE);
    const platePrint = await sharp(await encodeRgbaPng(plateRaw))
      .withMetadata({ density: pngDensityPpi })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const progressed = await getDatabase()
      .update(renderJobs)
      .set({ progress: 65, updatedAt: new Date() })
      .where(and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.status, "running"),
        sql`${renderJobs.input}->>'leaseToken' = ${leaseToken}`
      ))
      .returning({ id: renderJobs.id });
    if (progressed.length !== 1) throw new Error("Production job lease was lost during rendering");
    const mask = await sharp(lut.validMask, {
      raw: { width: lut.width, height: lut.height, channels: 1 }
    })
      .resize(PRODUCTION_SIZE, PRODUCTION_SIZE, { kernel: "nearest" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const targetToPlate = generateTargetPlateMap(opticalProfile);
    const proof = await encodeRgbaPng(renderOpticalProof(plateRaw, targetToPlate, PREVIEW_SIZE));
    const designJson = Buffer.from(JSON.stringify(snapshot.design, null, 2));
    const readme = strToU8(
      "DIGITAL MVP TEST OUTPUT - NOT PHYSICALLY CALIBRATED\n" +
      "Print plate-print.png as a top view without rotation, mirroring, crop, or alpha flattening.\n" +
      "Pixel origin is top-left; image right follows +X and image down follows +Z (printUV +X,-Z).\n" +
      "Unmapped pixels use straight alpha and must remain transparent.\n"
    );
    const describeFile = (bytes: Uint8Array, mimeType: string) => ({
      byteSize: bytes.byteLength,
      mimeType,
      sha256: sha256(bytes)
    });
    const manifest = {
      schemaVersion: 1,
      snapshotId: snapshot.id,
      previewSessionId: session.id,
      commit:
        process.env.GIT_COMMIT_SHA ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.GITHUB_SHA ??
        "local-development",
      opticalProfile: frozenProfile,
      color: {
        space: "sRGB IEC61966-2.1",
        alpha: "straight",
        unmappedPixels: "transparent"
      },
      coordinates: {
        view: "plate top view",
        pixelOrigin: "top-left",
        printUv: opticalProfile.coordinateSystem.printUv,
        imageRight: "+X",
        imageDown: "+Z",
        physicalUnits: "millimetres",
        cupAxisOffsetFromDishCenterMm: [
          Number(((opticalProfile.cup.axisOrigin[0] - opticalProfile.dish.center[0]) * 1000).toFixed(6)),
          Number(((opticalProfile.cup.axisOrigin[2] - opticalProfile.dish.center[2]) * 1000).toFixed(6))
        ],
        registration: "Do not mirror or rotate; align the plate centre and +X direction before printing"
      },
      output: {
        pixels: PRODUCTION_SIZE,
        dishDiameterMm: Number(dishDiameterMm.toFixed(6)),
        approximatelyPpi: Number(exactPpi.toFixed(3)),
        pngDensityPpi
      },
      files: {
        "plate-print.png": describeFile(platePrint, "image/png"),
        "plate-mask.png": describeFile(mask, "image/png"),
        "proof.png": describeFile(proof, "image/png"),
        "design.json": describeFile(designJson, "application/json"),
        "README.txt": describeFile(readme, "text/plain; charset=utf-8")
      },
      generatedAt: new Date().toISOString()
    };
    const manifestJson = Buffer.from(JSON.stringify(manifest, null, 2));
    const archive = zipSync(
      {
        "plate-print.png": platePrint,
        "plate-mask.png": mask,
        "proof.png": proof,
        "design.json": designJson,
        "manifest.json": manifestJson,
        "README.txt": readme
      },
      { level: 6 }
    );
    const storedBundle = await storeGeneratedAsset({
      kind: "production-bundle",
      extension: "zip",
      mimeType: "application/zip",
      bytes: archive,
      metadata: { snapshotId: snapshot.id }
    });
    const asset = storedBundle.asset;
    try {
      await getDatabase().transaction(async (transaction) => {
        await transaction.insert(productionArtifacts).values({
          snapshotId: snapshot.id,
          renderJobId: claimedJob.id,
          bundleAssetId: asset.id,
          manifest,
          checksum: sha256(stableJson(manifest)),
          createdBy: actorAdminUserId
        });
        const completed = await transaction
          .update(renderJobs)
          .set({
            status: "ready",
            progress: 100,
            outputAssetId: asset.id,
            input: sql`${renderJobs.input} - 'leaseToken'`,
            updatedAt: new Date()
          })
          .where(and(
            eq(renderJobs.id, claimedJob.id),
            eq(renderJobs.status, "running"),
            sql`${renderJobs.input}->>'leaseToken' = ${leaseToken}`
          ))
          .returning({ id: renderJobs.id });
        if (completed.length !== 1) throw new Error("Production job lease was lost before persistence");
      });
      return "ready";
    } catch (error) {
      if (storedBundle.created) {
        await getDatabase().transaction(async (transaction) => {
          await transaction
            .insert(storageDeletionOutbox)
            .values(storageDeletionValues([{
              storageKey: asset.storageKey,
              reason: "production_bundle_persistence_failed"
            }]))
            .onConflictDoUpdate(storageDeletionConflictClause());
          await transaction.delete(assets).where(eq(assets.id, asset.id));
        }).then(() => processStorageDeletionOutbox({ limit: 20 })).catch((cleanupError: unknown) => {
          console.error("Uncommitted production bundle cleanup could not be queued", cleanupError);
        });
      }
      throw error;
    }
  } catch (error) {
    await markProductionJobFailed(jobId, error, leaseToken);
    return "failed";
  }
}

export function executeProductionBundle(
  jobId: string,
  actorAdminUserId: string,
  hooks: ProductionExecutionHooks = {}
): Promise<ProductionExecutionResult> {
  return productionRenderGate.run(() => executeProductionBundleInternal(jobId, actorAdminUserId, hooks));
}

/**
 * Startup recovery only changes durable database state. It deliberately does
 * not execute work in the Next.js process; the separate production worker will
 * pick the re-queued jobs up.
 */
export async function recoverProductionJobs(staleBefore = new Date(Date.now() - 5 * 60 * 1000)): Promise<number> {
  const recovered = await getDatabase()
    .update(renderJobs)
    .set({
      status: "queued",
      progress: 0,
      input: sql`${renderJobs.input} - 'leaseToken'`,
      updatedAt: new Date()
    })
    .where(and(
      eq(renderJobs.kind, "production_bundle"),
      eq(renderJobs.status, "running"),
      lt(renderJobs.updatedAt, staleBefore)
    ))
    .returning({ id: renderJobs.id });
  return recovered.length;
}

export interface QueuedProductionJob {
  id: string;
  actorAdminUserId: string;
}

/**
 * Returns an unclaimed candidate. Claiming remains an atomic queued -> running
 * update inside executeProductionBundle, so multiple worker processes may poll
 * safely without a distributed in-memory lock.
 */
export async function findNextQueuedProductionJob(): Promise<QueuedProductionJob | undefined> {
  for (let inspected = 0; inspected < 20; inspected += 1) {
    const candidate = await getDatabase().query.renderJobs.findFirst({
      where: and(eq(renderJobs.kind, "production_bundle"), eq(renderJobs.status, "queued")),
      orderBy: [asc(renderJobs.createdAt)]
    });
    if (!candidate) return undefined;
    const actorAdminUserId = (candidate.input as { actorAdminUserId?: unknown }).actorAdminUserId;
    if (typeof actorAdminUserId === "string") {
      return { id: candidate.id, actorAdminUserId };
    }
    // Older/incomplete rows cannot be rendered with an auditable creator.
    // Marking them failed also prevents a malformed first row from starving
    // the rest of the FIFO queue.
    await markProductionJobFailed(candidate.id, new Error("Production job is missing its creating administrator"));
  }
  return undefined;
}

export async function heartbeatProductionJob(jobId: string, leaseToken: string): Promise<boolean> {
  const touched = await getDatabase()
    .update(renderJobs)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(renderJobs.id, jobId),
      eq(renderJobs.kind, "production_bundle"),
      eq(renderJobs.status, "running"),
      sql`${renderJobs.input}->>'leaseToken' = ${leaseToken}`
    ))
    .returning({ id: renderJobs.id });
  return touched.length === 1;
}

export async function serializeRenderJob(row: typeof renderJobs.$inferSelect): Promise<RenderJob> {
  const output = row.outputAssetId ? await findAsset(row.outputAssetId) : undefined;
  return {
    id: row.id,
    sessionId: row.previewSessionId,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    output: output
      ? {
          id: output.id,
          kind: output.kind,
          url:
            row.kind === "preview"
              ? `/api/v1/preview-sessions/${row.previewSessionId}/assets/${output.id}`
              : `/api/v1/assets/${output.id}`,
          mimeType: output.mimeType,
          width: output.width ?? undefined,
          height: output.height ?? undefined,
          sha256: output.sha256
        }
      : undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

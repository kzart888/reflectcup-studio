import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";

import { getDatabase } from "@/db/client";
import {
  assets,
  auditLogs,
  designSnapshots,
  opticalProfiles,
  previewSessions,
  storageDeletionOutbox
} from "@/db/schema";
import type { AssetRef, CameraState, CropTransform, PreviewSession, PreviewSessionStatus } from "@/lib/contracts";
import { DEFAULT_CROP, MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { ApiError } from "@/domains/auth/http";
import { sha256, stableJson } from "@/domains/auth/security";
import { validateStoredOpticalProfile } from "@/domains/profiles/profile-service";
import {
  DEFAULT_SCENE_ID,
  findLegacySceneV1Identity,
  findPublishedScene,
  type PublishedSceneId
} from "@/domains/scenes/catalog";
import { getPreviewRuntimeSettings } from "@/domains/settings/runtime-settings";
import {
  CONFIRMED_ACCESS_TTL_SECONDS,
  DRAFT_ACCESS_TTL_SECONDS,
  issueInitialAccessTokens,
  refreshSessionAccessExpiry
} from "@/domains/sessions/access-service";
import { assetStorageKeys, findAsset, insertAsset, type AssetRecord } from "@/repositories/assets";
import { findProfile, findPublishedProfile } from "@/repositories/profiles";
import { findLatestSnapshotsForSessions, findPreviewSession } from "@/repositories/preview-sessions";
import { getStorage } from "@/storage/filesystem-storage";
import {
  enqueueStorageDeletions,
  processStorageDeletionOutbox,
  storageDeletionConflictClause,
  storageDeletionValues
} from "@/storage/deletion-outbox";
import { constrainCamera, constrainCrop, parseOpticalProfile } from "@/optics";
import { WorkGate } from "@/lib/work-gate";

export type SessionPatch = {
  revision: number;
  crop?: CropTransform;
  camera?: CameraState;
  sceneId?: PublishedSceneId;
};

const SESSION_CREATION_ACTION = "preview_session.created";
const SESSION_CREATION_LIMIT = 30;
const SESSION_CREATION_WINDOW_MS = 60 * 60 * 1000;
const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CONFIRMED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const uploadWorkGate = new WorkGate(2, 4, "UPLOAD_CAPACITY_EXCEEDED");
const SNAPSHOT_BACKED_STATUSES = new Set<PreviewSessionStatus>([
  "confirmed",
  "checkout_pending",
  "paid",
  "production_ready",
  "completed"
]);

function assetRef(asset: AssetRecord | undefined, sessionId: string): AssetRef | undefined {
  if (!asset) return undefined;
  const variant = asset.kind === "source" ? "?variant=preview" : "";
  return {
    id: asset.id,
    kind: asset.kind,
    url: `/api/v1/preview-sessions/${sessionId}/assets/${asset.id}${variant}`,
    mimeType: asset.mimeType,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    sha256: asset.sha256
  };
}

type SessionSceneReference = Pick<PreviewSession, "sceneId" | "sceneVersion" | "sceneChecksum">;

function currentSceneReference(sceneId: string): SessionSceneReference {
  const scene = findPublishedScene(sceneId);
  if (!scene) throw new ApiError(500, "SCENE_RELEASE_MISSING", "The session scene is no longer published");
  return {
    sceneId: scene.id,
    sceneVersion: scene.version,
    sceneChecksum: scene.checksum
  };
}

function snapshotSceneReference(design: Record<string, unknown>): SessionSceneReference {
  const sceneId = design.sceneId;
  const sceneVersion = design.sceneVersion;
  const sceneChecksum = design.sceneChecksum;
  if (typeof sceneId === "string" && sceneVersion === undefined && sceneChecksum === undefined) {
    const legacyV1 = findLegacySceneV1Identity(sceneId);
    if (legacyV1) {
      return {
        sceneId: legacyV1.id,
        sceneVersion: legacyV1.version,
        sceneChecksum: legacyV1.checksum
      };
    }
  }
  if (
    typeof sceneId !== "string" ||
    typeof sceneVersion !== "number" ||
    !Number.isInteger(sceneVersion) ||
    sceneVersion < 1 ||
    typeof sceneChecksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(sceneChecksum)
  ) {
    throw new ApiError(500, "SCENE_SNAPSHOT_INVALID", "The confirmed design has an invalid saved scene reference");
  }
  return { sceneId, sceneVersion, sceneChecksum };
}

async function sessionSceneReference(
  row: typeof previewSessions.$inferSelect,
  knownSnapshot?: typeof designSnapshots.$inferSelect | null
): Promise<SessionSceneReference> {
  if (row.status === "draft") return currentSceneReference(row.sceneId);

  const snapshot = knownSnapshot === undefined
    ? (await findLatestSnapshotsForSessions([row.id])).get(row.id)
    : knownSnapshot ?? undefined;
  if (snapshot) return snapshotSceneReference(snapshot.design);

  // Expired rows are administrative tombstones after retention has removed
  // their snapshot. They cannot be reopened, so only expose the current label.
  if (row.status === "expired") return currentSceneReference(row.sceneId);
  if (SNAPSHOT_BACKED_STATUSES.has(row.status)) {
    throw new ApiError(500, "SCENE_SNAPSHOT_MISSING", "The confirmed design scene snapshot is missing");
  }
  return currentSceneReference(row.sceneId);
}

export async function serializeSession(row: typeof previewSessions.$inferSelect): Promise<PreviewSession> {
  const [profile, source, preview, previewSettings, sceneReference] = await Promise.all([
    findProfile(row.opticalProfileId),
    row.sourceAssetId ? findAsset(row.sourceAssetId) : undefined,
    row.previewAssetId ? findAsset(row.previewAssetId) : undefined,
    getPreviewRuntimeSettings(),
    sessionSceneReference(row)
  ]);
  if (!profile) throw new ApiError(500, "PROFILE_MISSING", "The session optical profile no longer exists");
  const opticalRuntime = await validateStoredOpticalProfile(profile);
  const opticalBaseUrl = `/api/v1/preview-sessions/${row.id}/optical-profile`;
  const [lutWidth, lutHeight] = opticalRuntime.document.mapping.lutSize;
  const [targetWidth, targetHeight] = opticalRuntime.document.mapping.targetSamples;
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    opticalProfile: {
      id: profile.id,
      slug: profile.slug,
      label: profile.label,
      version: profile.version,
      status: profile.status
    },
    opticalRuntime: {
      schemaVersion: 1,
      checksum: profile.checksum,
      profile: opticalRuntime.document,
      lut: {
        url: `${opticalBaseUrl}/lut`,
        mimeType: "application/octet-stream",
        width: lutWidth,
        height: lutHeight,
        byteSize: opticalRuntime.lutAsset.byteSize,
        sha256: opticalRuntime.lutAsset.sha256,
        encoding: "rg32f-le"
      },
      mask: {
        url: `${opticalBaseUrl}/mask`,
        mimeType: "application/octet-stream",
        width: lutWidth,
        height: lutHeight,
        byteSize: opticalRuntime.maskAsset.byteSize,
        sha256: opticalRuntime.maskAsset.sha256,
        encoding: "r8"
      },
      targetMask: {
        url: `${opticalBaseUrl}/target-mask`,
        mimeType: "image/png",
        width: targetWidth,
        height: targetHeight,
        encoding: "png-r8"
      },
      targetContour: {
        url: `${opticalBaseUrl}/target-contour`,
        mimeType: "application/json",
        encoding: "target-contour-v1"
      }
    },
    previewSettings,
    ...sceneReference,
    crop: row.crop,
    camera: row.camera,
    source: assetRef(source, row.id),
    preview: assetRef(preview, row.id),
    styleStrategy: "identity",
    fillStrategy: "none",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function serializeAdminSession(
  row: typeof previewSessions.$inferSelect,
  snapshot?: typeof designSnapshots.$inferSelect | null
): Promise<Omit<PreviewSession, "opticalRuntime" | "previewSettings">> {
  const [profile, source, preview, sceneReference] = await Promise.all([
    findProfile(row.opticalProfileId),
    row.sourceAssetId ? findAsset(row.sourceAssetId) : undefined,
    row.previewAssetId ? findAsset(row.previewAssetId) : undefined,
    sessionSceneReference(row, snapshot)
  ]);
  if (!profile) throw new ApiError(500, "PROFILE_MISSING", "The session optical profile no longer exists");
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    opticalProfile: {
      id: profile.id,
      slug: profile.slug,
      label: profile.label,
      version: profile.version,
      status: profile.status
    },
    ...sceneReference,
    crop: row.crop,
    camera: row.camera,
    source: assetRef(source, row.id),
    preview: assetRef(preview, row.id),
    styleStrategy: "identity",
    fillStrategy: "none",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function createSession(profileId: string | undefined, ipHash: string) {
  const profile = await findPublishedProfile(profileId);
  if (!profile) {
    throw new ApiError(503, "NO_PUBLISHED_PROFILE", "No published optical profile is available");
  }
  const profileDocument = parseOpticalProfile(profile.profile);
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ipHash}, 0))`);
    const windowStart = new Date(Date.now() - SESSION_CREATION_WINDOW_MS);
    const [recent] = await transaction
      .select({ value: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, SESSION_CREATION_ACTION),
          eq(auditLogs.ipHash, ipHash),
          gte(auditLogs.createdAt, windowStart)
        )
      );
    if (Number(recent?.value ?? 0) >= SESSION_CREATION_LIMIT) {
      throw new ApiError(429, "SESSION_RATE_LIMITED", "Too many designs were created. Try again later.");
    }
    const [row] = await transaction
      .insert(previewSessions)
      .values({
        opticalProfileId: profile.id,
        sceneId: DEFAULT_SCENE_ID,
        crop: DEFAULT_CROP,
        camera: {
          position: profileDocument.designCamera.position,
          target: profileDocument.designCamera.target
        },
        expiresAt: new Date(Date.now() + DRAFT_RETENTION_MS)
      })
      .returning();
    const tokens = await issueInitialAccessTokens(row.id, transaction);
    await transaction.insert(auditLogs).values({
      action: SESSION_CREATION_ACTION,
      targetType: "preview_session",
      targetId: row.id,
      ipHash,
      metadata: { opticalProfileId: profile.id }
    });
    return { row, ...tokens };
  });
}

export async function getSessionOrThrow(id: string) {
  const row = await findPreviewSession(id);
  if (!row) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
  return row;
}

export async function patchSession(id: string, patch: SessionPatch) {
  const current = await getSessionOrThrow(id);
  if (current.status !== "draft") throw new ApiError(409, "SESSION_NOT_EDITABLE", "Confirmed designs cannot be edited");
  if (current.revision !== patch.revision) {
    throw new ApiError(409, "REVISION_CONFLICT", "A newer version of this design exists", {
      revision: current.revision,
      updatedAt: current.updatedAt.toISOString()
    });
  }
  const [source, profile] = await Promise.all([
    current.sourceAssetId ? findAsset(current.sourceAssetId) : undefined,
    patch.camera ? findProfile(current.opticalProfileId) : undefined
  ]);
  if (current.sourceAssetId && !source) throw new ApiError(500, "SOURCE_MISSING", "The session source asset is missing");
  if (patch.camera && !profile) throw new ApiError(500, "PROFILE_MISSING", "The session optical profile is missing");
  const canonicalCrop = patch.crop
    ? constrainCrop(patch.crop, source?.width ?? 1, source?.height ?? 1)
    : undefined;
  const profileDocument = profile ? parseOpticalProfile(profile.profile) : undefined;
  const canonicalCamera = patch.camera && profileDocument
    ? constrainCamera(patch.camera, profileDocument.designCamera.target, profileDocument.designCamera.position)
    : undefined;
  const scene = patch.sceneId ? findPublishedScene(patch.sceneId) : undefined;
  if (patch.sceneId && !scene) throw new ApiError(400, "INVALID_SCENE_ID", "The requested scene is not published");
  const [row] = await getDatabase()
    .update(previewSessions)
    .set({
      crop: canonicalCrop,
      camera: canonicalCamera,
      sceneId: scene?.id,
      revision: sql`${previewSessions.revision} + 1`,
      expiresAt: new Date(Date.now() + DRAFT_RETENTION_MS),
      updatedAt: new Date()
    })
    .where(
      and(
        eq(previewSessions.id, id),
        eq(previewSessions.revision, patch.revision),
        eq(previewSessions.status, "draft")
      )
    )
    .returning();
  if (row) {
    await refreshSessionAccessExpiry(id, DRAFT_ACCESS_TTL_SECONDS);
    return row;
  }
  const latest = await getSessionOrThrow(id);
  if (latest.status !== "draft") throw new ApiError(409, "SESSION_NOT_EDITABLE", "Confirmed designs cannot be edited");
  throw new ApiError(409, "REVISION_CONFLICT", "A newer version of this design exists", {
    revision: latest.revision,
    updatedAt: latest.updatedAt.toISOString()
  });
}

async function uploadSourceInternal(id: string, file: File) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "UPLOAD_SIZE_INVALID", `Image must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes`);
  }
  const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedMime.has(file.type)) {
    throw new ApiError(415, "UPLOAD_TYPE_UNSUPPORTED", "Use a JPEG, PNG, or WebP image");
  }
  const session = await getSessionOrThrow(id);
  if (session.status !== "draft") throw new ApiError(409, "SESSION_NOT_EDITABLE", "Confirmed designs cannot be edited");

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ApiError(422, "IMAGE_DECODE_FAILED", "The uploaded file is not a valid supported image");
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new ApiError(413, "IMAGE_PIXELS_EXCEEDED", `Decoded image may not exceed ${MAX_INPUT_PIXELS} pixels`);
  }
  if (!metadata.format || !new Set(["jpeg", "png", "webp"]).has(metadata.format)) {
    throw new ApiError(415, "IMAGE_CONTENT_UNSUPPORTED", "The image content does not match a supported format");
  }
  const formatForMime: Record<string, "jpeg" | "png" | "webp"> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp"
  };
  if (metadata.format !== formatForMime[file.type]) {
    throw new ApiError(415, "IMAGE_MIME_MISMATCH", "The declared image type does not match its decoded content");
  }

  let normalized: Buffer;
  let browserPreview: Buffer;
  let normalizedMetadata: Metadata;
  let browserPreviewMetadata: Metadata;
  try {
    normalized = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .toColorspace("srgb")
      .webp({ quality: 92, effort: 4, smartSubsample: true })
      .toBuffer();
    normalizedMetadata = await sharp(normalized).metadata();
    browserPreview = await sharp(normalized)
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, effort: 4, smartSubsample: true })
      .toBuffer();
    browserPreviewMetadata = await sharp(browserPreview).metadata();
    if (!browserPreviewMetadata.width || !browserPreviewMetadata.height) {
      throw new Error("Browser preview dimensions are missing");
    }
  } catch {
    throw new ApiError(422, "IMAGE_NORMALIZATION_FAILED", "The image could not be normalized");
  }

  const digest = sha256(normalized);
  const previewDigest = sha256(browserPreview);
  const key = `sessions/${id}/source/${randomUUID()}.webp`;
  const previewKey = `sessions/${id}/source-preview/${randomUUID()}.webp`;
  const storage = getStorage();
  try {
    await storage.put(key, normalized);
    await storage.put(previewKey, browserPreview);
  } catch (error) {
    await Promise.all([
      storage.delete(key).catch(() => undefined),
      storage.delete(previewKey).catch(() => undefined)
    ]);
    throw error;
  }
  let asset: AssetRecord;
  try {
    asset = await insertAsset({
      ownerSessionId: id,
      kind: "source",
      storageKey: key,
      mimeType: "image/webp",
      byteSize: normalized.byteLength,
      width: normalizedMetadata.width,
      height: normalizedMetadata.height,
      sha256: digest,
      metadata: {
        originalMimeType: file.type,
        originalName: file.name.slice(0, 200),
        previewStorageKey: previewKey,
        previewByteSize: browserPreview.byteLength,
        previewSha256: previewDigest,
        previewWidth: browserPreviewMetadata.width,
        previewHeight: browserPreviewMetadata.height
      }
    });
  } catch (error) {
    await enqueueStorageDeletions([
      { storageKey: key, reason: "source_asset_insert_failed" },
      { storageKey: previewKey, reason: "source_preview_asset_insert_failed" }
    ])
      .then(() => processStorageDeletionOutbox({ limit: 20 }))
      .catch(async (cleanupError: unknown) => {
        console.error("Source object cleanup could not be queued", cleanupError);
        await Promise.all([
          storage.delete(key).catch(() => undefined),
          storage.delete(previewKey).catch(() => undefined)
        ]);
      });
    throw error;
  }
  let updated: typeof previewSessions.$inferSelect;
  let staleAssets: AssetRecord[];
  try {
    ({ updated, staleAssets } = await getDatabase().transaction(async (transaction) => {
      const [locked] = await transaction
        .select()
        .from(previewSessions)
        .where(eq(previewSessions.id, id))
        .for("update");
      if (!locked || locked.status !== "draft") {
        throw new ApiError(409, "SESSION_NOT_EDITABLE", "Confirmed designs cannot be edited");
      }
      const staleIds = [...new Set([locked.sourceAssetId, locked.previewAssetId])]
        .filter((entry): entry is string => Boolean(entry && entry !== asset.id));
      const staleAssets = staleIds.length > 0
        ? await transaction
            .select()
            .from(assets)
            .where(
              and(
                inArray(assets.id, staleIds),
                eq(assets.ownerSessionId, id),
                inArray(assets.kind, ["source", "preview"])
              )
            )
        : [];
      const [updated] = await transaction
        .update(previewSessions)
        .set({
          sourceAssetId: asset.id,
          previewAssetId: null,
          crop: DEFAULT_CROP,
          revision: sql`${previewSessions.revision} + 1`,
          expiresAt: new Date(Date.now() + DRAFT_RETENTION_MS),
          updatedAt: new Date()
        })
        .where(eq(previewSessions.id, id))
        .returning();
      await refreshSessionAccessExpiry(id, DRAFT_ACCESS_TTL_SECONDS, transaction);
      if (staleAssets.length > 0) {
        await transaction
          .insert(storageDeletionOutbox)
          .values(storageDeletionValues(staleAssets.flatMap((entry) => (
            assetStorageKeys(entry).map((storageKey) => ({ storageKey, reason: "source_replaced" }))
          ))))
          .onConflictDoUpdate(storageDeletionConflictClause());
        await transaction.delete(assets).where(inArray(assets.id, staleAssets.map((entry) => entry.id)));
      }
      return { updated, staleAssets };
    }));
  } catch (error) {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .insert(storageDeletionOutbox)
        .values(storageDeletionValues([
          { storageKey: key, reason: "source_update_rolled_back" },
          { storageKey: previewKey, reason: "source_preview_update_rolled_back" }
        ]))
        .onConflictDoUpdate(storageDeletionConflictClause());
      await transaction.delete(assets).where(eq(assets.id, asset.id));
    }).then(() => processStorageDeletionOutbox({ limit: 20 })).catch((cleanupError: unknown) => {
      console.error("Rolled-back source object cleanup could not be queued", cleanupError);
    });
    throw error;
  }
  if (staleAssets.length > 0) {
    await processStorageDeletionOutbox({ limit: Math.max(20, staleAssets.length) }).catch((cleanupError: unknown) => {
      console.error("Superseded draft objects remain queued for retry", cleanupError);
    });
  }
  return { row: updated, asset };
}

export function uploadSource(id: string, file: File) {
  return uploadWorkGate.run(() => uploadSourceInternal(id, file));
}

export async function confirmSession(id: string, revision: number) {
  return getDatabase().transaction(async (transaction) => {
    const [row] = await transaction
      .select()
      .from(previewSessions)
      .where(eq(previewSessions.id, id))
      .for("update");
    if (!row) throw new ApiError(404, "SESSION_NOT_FOUND", "Design session was not found");
    if (row.status !== "draft") throw new ApiError(409, "SESSION_NOT_EDITABLE", "Design is already confirmed");
    if (row.revision !== revision) {
      throw new ApiError(409, "REVISION_CONFLICT", "A newer version of this design exists", { revision: row.revision });
    }
    if (!row.sourceAssetId) throw new ApiError(409, "SOURCE_REQUIRED", "Upload an image before confirming the design");
    const profile = await transaction.query.opticalProfiles.findFirst({ where: eq(opticalProfiles.id, row.opticalProfileId) });
    if (!profile) throw new ApiError(500, "PROFILE_MISSING", "The session optical profile is missing");
    const profileDocument = parseOpticalProfile(profile.profile);
    const scene = findPublishedScene(row.sceneId);
    if (!scene) throw new ApiError(409, "SCENE_NOT_PUBLISHED", "The selected scene is no longer published");

    const design = {
      previewSessionId: row.id,
      revision: row.revision,
      opticalProfileId: row.opticalProfileId,
      opticalProfile: {
        id: profile.id,
        slug: profile.slug,
        version: profile.version,
        checksum: profile.checksum,
        generatorVersion: profileDocument.mapping.generatorVersion,
        geometryChecksum: profileDocument.checksums.geometry,
        lutChecksum: profileDocument.checksums.lut
      },
      crop: row.crop,
      camera: row.camera,
      sceneId: scene.id,
      sceneVersion: scene.version,
      sceneChecksum: scene.checksum,
      sourceAssetId: row.sourceAssetId,
      previewAssetId: row.previewAssetId,
      styleStrategy: row.styleStrategy,
      fillStrategy: row.fillStrategy,
      renderer: { id: "reflectcup-cpu-lut", version: 1 }
    };
    const checksum = sha256(stableJson(design));
    const [snapshot] = await transaction
      .insert(designSnapshots)
      .values({
        previewSessionId: row.id,
        revision: row.revision,
        opticalProfileId: row.opticalProfileId,
        sourceAssetId: row.sourceAssetId,
        previewAssetId: row.previewAssetId,
        design,
        checksum
      })
      .returning();
    const [updated] = await transaction
      .update(previewSessions)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + CONFIRMED_RETENTION_MS),
        updatedAt: new Date()
      })
      .where(and(eq(previewSessions.id, id), eq(previewSessions.revision, revision), eq(previewSessions.status, "draft")))
      .returning();
    if (!updated) throw new ApiError(409, "REVISION_CONFLICT", "The design changed while it was being confirmed");
    await refreshSessionAccessExpiry(id, CONFIRMED_ACCESS_TTL_SECONDS, transaction);
    return { row: updated, snapshot };
  });
}

export function serializeAsset(asset: AssetRecord, sessionId: string): AssetRef {
  return assetRef(asset, sessionId)!;
}

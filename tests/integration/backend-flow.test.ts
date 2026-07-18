import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { strFromU8, unzipSync } from "fflate";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createSessionRoute } from "@/app/api/v1/preview-sessions/route";
import { GET as getSessionRoute, PATCH as patchSessionRoute } from "@/app/api/v1/preview-sessions/[id]/route";
import { GET as getOpticalResourceRoute } from "@/app/api/v1/preview-sessions/[id]/optical-profile/[resource]/route";
import { GET as listAdminSessionsRoute } from "@/app/api/v1/admin/preview-sessions/route";
import { POST as createAdminProfileRoute } from "@/app/api/v1/admin/optical-profiles/route";
import { PATCH as patchAdminProfileRoute } from "@/app/api/v1/admin/optical-profiles/[id]/route";
import { getDatabase } from "@/db/client";
import {
  adminSessions,
  adminUsers,
  assets,
  auditLogs,
  designSnapshots,
  loginAttempts,
  opticalProfiles,
  previewAccessTokens,
  previewSessions,
  productionArtifacts,
  renderJobs,
  storageDeletionOutbox
} from "@/db/schema";
import {
  createPreviewRender,
  heartbeatProductionJob,
  markProductionJobFailed,
  queueProductionBundle,
  recoverProductionJobs
} from "@/domains/artifacts/render-service";
import { runProductionJobThread } from "@/domains/artifacts/production-thread-runner";
import { authenticateAdmin, loginAdmin } from "@/domains/auth/admin-service";
import { validateOpticalProfileCandidate } from "@/domains/profiles/profile-service";
import { findPublishedScene } from "@/domains/scenes/catalog";
import { confirmSession, patchSession, uploadSource } from "@/domains/sessions/session-service";
import { expireStaleSessions } from "@/domains/sessions/retention-service";
import { sessionCookieName } from "@/domains/sessions/access-service";
import { hashClientAddress, hashPassword, normalizeEmail, sha256, stableJson } from "@/domains/auth/security";
import { ADMIN_COOKIE_NAME, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { createNominalOpticalProfile, generateOpticalProfile } from "@/optics";
import { findAsset } from "@/repositories/assets";
import { ADMIN_LOGIN_LIMITS } from "@/repositories/admin";
import { getStorage } from "@/storage/filesystem-storage";
import { enqueueStorageDeletions, processStorageDeletionOutbox } from "@/storage/deletion-outbox";

const origin = "http://127.0.0.1:3000";
const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
const createdSessionIds: string[] = [];
let storageRoot = "";
let testProfileId = "";
const profileAssetIds: string[] = [];
const productionAssetIds: string[] = [];
const adminCreatedProfileIds: string[] = [];
let testAdminId = "";
let testAdminEmail = "";
const testAdminPassword = "Correct-Horse-Battery-47!";

function cookieValue(setCookie: string, name: string): string {
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Cookie ${name} was not set`);
  return match[1];
}

async function cleanup(): Promise<void> {
  const db = getDatabase();
  if (createdSessionIds.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.targetId, createdSessionIds));
    const snapshots = await db
      .select({ id: designSnapshots.id })
      .from(designSnapshots)
      .where(inArray(designSnapshots.previewSessionId, createdSessionIds));
    if (snapshots.length > 0) {
      await db.delete(productionArtifacts).where(inArray(productionArtifacts.snapshotId, snapshots.map((row) => row.id)));
    }
    await db.delete(renderJobs).where(inArray(renderJobs.previewSessionId, createdSessionIds));
    await db.delete(designSnapshots).where(inArray(designSnapshots.previewSessionId, createdSessionIds));
    await db.delete(previewAccessTokens).where(inArray(previewAccessTokens.previewSessionId, createdSessionIds));
    await db.delete(previewSessions).where(inArray(previewSessions.id, createdSessionIds));
    await db.delete(assets).where(inArray(assets.ownerSessionId, createdSessionIds));
  }
  if (productionAssetIds.length > 0) await db.delete(assets).where(inArray(assets.id, productionAssetIds));
  if (adminCreatedProfileIds.length > 0) await db.delete(opticalProfiles).where(inArray(opticalProfiles.id, adminCreatedProfileIds));
  if (testProfileId) await db.delete(opticalProfiles).where(eq(opticalProfiles.id, testProfileId));
  if (profileAssetIds.length > 0) await db.delete(assets).where(inArray(assets.id, profileAssetIds));
  if (testAdminId) {
    await db.delete(auditLogs).where(eq(auditLogs.actorAdminUserId, testAdminId));
    await db.delete(adminUsers).where(eq(adminUsers.id, testAdminId));
  }
  if (testAdminEmail) await db.delete(loginAttempts).where(eq(loginAttempts.normalizedEmail, testAdminEmail));
}

beforeAll(async () => {
  process.env.APP_ORIGIN = origin;
  process.env.TRUST_PROXY_HEADERS = "true";
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "reflectcup-backend-test-"));
  process.env.STORAGE_ROOT = storageRoot;
  await migrate(getDatabase(), { migrationsFolder: path.resolve("drizzle") });
  const nominal = createNominalOpticalProfile({ status: "published", targetSamples: [65, 65], lutSize: [256, 256] });
  const generated = generateOpticalProfile({
    ...nominal,
    slug: `backend-test-${Date.now()}`,
    label: "Backend integration profile"
  });
  const lutBytes = new Uint8Array(
    generated.plateToTarget.targetUv.buffer,
    generated.plateToTarget.targetUv.byteOffset,
    generated.plateToTarget.targetUv.byteLength
  );
  const lutKey = `test/${generated.profile.slug}.rg32f`;
  const maskKey = `test/${generated.profile.slug}.r8`;
  await getStorage().put(lutKey, lutBytes);
  await getStorage().put(maskKey, generated.plateToTarget.validMask);
  const [lutAsset, maskAsset] = await getDatabase()
    .insert(assets)
    .values([
      {
        kind: "optical-lut",
        storageKey: lutKey,
        mimeType: "application/octet-stream",
        byteSize: lutBytes.byteLength,
        sha256: sha256(lutBytes)
      },
      {
        kind: "optical-mask",
        storageKey: maskKey,
        mimeType: "application/octet-stream",
        byteSize: generated.plateToTarget.validMask.byteLength,
        sha256: sha256(generated.plateToTarget.validMask)
      }
    ])
    .returning();
  profileAssetIds.push(lutAsset.id, maskAsset.id);
  const [profile] = await getDatabase()
    .insert(opticalProfiles)
    .values({
      slug: generated.profile.slug,
      label: generated.profile.label,
      version: 1,
      status: "published",
      profile: generated.profile as unknown as Record<string, unknown>,
      checksum: sha256(stableJson(generated.profile)),
      lutAssetId: lutAsset.id,
      maskAssetId: maskAsset.id,
      publishedAt: new Date(Date.now() + 1000)
    })
    .returning();
  testProfileId = profile.id;
  testAdminEmail = normalizeEmail(`backend-test-${Date.now()}@example.com`);
  const [admin] = await getDatabase()
    .insert(adminUsers)
    .values({
      email: testAdminEmail,
      passwordHash: await hashPassword(testAdminPassword),
      role: "owner",
      mustChangePassword: false
    })
    .returning();
  testAdminId = admin.id;
});

afterAll(async () => {
  await cleanup();
  await rm(storageRoot, { recursive: true, force: true });
  if (originalTrustProxyHeaders === undefined) delete process.env.TRUST_PROXY_HEADERS;
  else process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders;
});

describe("backend customer flow", () => {
  it("creates an opaque session, enforces revision locking, renders, and confirms an immutable snapshot", async () => {
    const createResponse = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
        body: "{}"
      })
    );
    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as {
      data: {
        session: {
          id: string;
          revision: number;
          opticalRuntime: {
            checksum: string;
            profile: { slug: string };
            lut: { url: string };
            mask: { url: string };
            targetMask: { url: string };
          };
        };
        resumeUrl: string;
      };
    };
    const sessionId = createBody.data.session.id;
    createdSessionIds.push(sessionId);
    const creationAudit = await getDatabase().query.auditLogs.findFirst({
      where: and(eq(auditLogs.action, "preview_session.created"), eq(auditLogs.targetId, sessionId))
    });
    expect(creationAudit?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(creationAudit?.ipHash).not.toContain("198.51.100.10");
    expect(createBody.data.resumeUrl).toContain(`/studio/${sessionId}#resume=`);
    expect(createBody.data.session.opticalRuntime).toMatchObject({
      profile: { slug: expect.stringMatching(/^backend-test-/) },
      lut: { url: `/api/v1/preview-sessions/${sessionId}/optical-profile/lut` },
      mask: { url: `/api/v1/preview-sessions/${sessionId}/optical-profile/mask` },
      targetMask: { url: `/api/v1/preview-sessions/${sessionId}/optical-profile/target-mask` }
    });
    expect(createBody.data.session.opticalRuntime.checksum).toMatch(/^[0-9a-f]{64}$/);
    const cookieName = sessionCookieName(sessionId);
    const editorToken = cookieValue(createResponse.headers.get("set-cookie") ?? "", cookieName);

    const unauthorizedLut = await getOpticalResourceRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}/optical-profile/lut`),
      { params: Promise.resolve({ id: sessionId, resource: "lut" }) }
    );
    expect(unauthorizedLut.status).toBe(401);
    const authorizedLut = await getOpticalResourceRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}/optical-profile/lut`, {
        headers: { cookie: `${cookieName}=${editorToken}` }
      }),
      { params: Promise.resolve({ id: sessionId, resource: "lut" }) }
    );
    expect(authorizedLut.status).toBe(200);
    expect(authorizedLut.headers.get("content-type")).toBe("application/octet-stream");
    expect((await authorizedLut.arrayBuffer()).byteLength).toBe(256 * 256 * 2 * Float32Array.BYTES_PER_ELEMENT);
    const targetMaskResponse = await getOpticalResourceRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}/optical-profile/target-mask`, {
        headers: { cookie: `${cookieName}=${editorToken}` }
      }),
      { params: Promise.resolve({ id: sessionId, resource: "target-mask" }) }
    );
    expect(targetMaskResponse.status).toBe(200);
    expect(await sharp(Buffer.from(await targetMaskResponse.arrayBuffer())).metadata()).toMatchObject({
      width: 65,
      height: 65,
      format: "png"
    });

    const getResponse = await getSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        headers: { cookie: `${cookieName}=${editorToken}` }
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).data.session.id).toBe(sessionId);

    const patchResponse = await patchSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { origin, cookie: `${cookieName}=${editorToken}`, "content-type": "application/json" },
        body: JSON.stringify({ revision: 0, crop: { centerX: 0.48, centerY: 0.52, scale: 1.25 } })
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(patchResponse.status).toBe(200);
    expect((await patchResponse.json()).data.session.revision).toBe(1);

    const conflictResponse = await patchSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { origin, cookie: `${cookieName}=${editorToken}`, "content-type": "application/json" },
        body: JSON.stringify({ revision: 0, crop: { centerX: 0.5, centerY: 0.5, scale: 1 } })
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(conflictResponse.status).toBe(409);
    expect((await conflictResponse.json()).error.code).toBe("REVISION_CONFLICT");

    const sourcePixels = Buffer.alloc(96 * 64 * 3);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 96; x += 1) {
        const offset = (y * 96 + x) * 3;
        sourcePixels[offset] = Math.round((x / 95) * 255);
        sourcePixels[offset + 1] = Math.round((y / 63) * 255);
        sourcePixels[offset + 2] = (x * 13 + y * 7) % 256;
      }
    }
    const sourcePng = await sharp(sourcePixels, { raw: { width: 96, height: 64, channels: 3 } })
      .png()
      .toBuffer();
    await expect(
      uploadSource(sessionId, new File([sourcePng], "mismatch.jpg", { type: "image/jpeg" }))
    ).rejects.toMatchObject({ status: 415, code: "IMAGE_MIME_MISMATCH" });
    await expect(
      uploadSource(sessionId, new File([Buffer.from("not-an-image")], "fake.png", { type: "image/png" }))
    ).rejects.toMatchObject({ status: 422, code: "IMAGE_DECODE_FAILED" });
    await expect(
      uploadSource(sessionId, new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "oversized.jpg", { type: "image/jpeg" }))
    ).rejects.toMatchObject({ status: 413, code: "UPLOAD_SIZE_INVALID" });
    const uploaded = await uploadSource(sessionId, new File([sourcePng], "test.png", { type: "image/png" }));
    expect(uploaded.asset.mimeType).toBe("image/webp");
    expect(uploaded.asset.metadata).toMatchObject({ originalName: "test.png" });

    const rendered = await createPreviewRender(sessionId, uploaded.row.revision);
    expect(rendered.job.status).toBe("ready");
    expect(rendered.asset.mimeType).toBe("image/png");
    const previewMetadata = await sharp(await getStorage().get(rendered.asset.storageKey)).metadata();
    expect(previewMetadata).toMatchObject({ width: 1024, height: 1024, format: "png" });

    const recropped = await patchSession(sessionId, {
      revision: rendered.session.revision,
      crop: { centerX: 0.56, centerY: 0.48, scale: 1.4 }
    });
    const secondRendered = await createPreviewRender(sessionId, recropped.revision);
    expect(secondRendered.asset.id).not.toBe(rendered.asset.id);
    expect(await findAsset(rendered.asset.id)).toBeUndefined();
    expect(await getStorage().exists(rendered.asset.storageKey)).toBe(false);

    const replacementPng = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 30, g: 120, b: 230 } }
    })
      .png()
      .toBuffer();
    let replaced = await uploadSource(sessionId, new File([replacementPng], "replacement-0.png", { type: "image/png" }));
    expect(replaced.row.sourceAssetId).toBe(replaced.asset.id);
    expect(replaced.row.previewAssetId).toBeNull();
    expect(await findAsset(uploaded.asset.id)).toBeUndefined();
    expect(await findAsset(rendered.asset.id)).toBeUndefined();
    expect(await getStorage().exists(uploaded.asset.storageKey)).toBe(false);
    expect(await getStorage().exists(rendered.asset.storageKey)).toBe(false);
    expect(await findAsset(secondRendered.asset.id)).toBeUndefined();
    expect(await getStorage().exists(secondRendered.asset.storageKey)).toBe(false);

    for (let index = 1; index < 20; index += 1) {
      const previous = replaced.asset;
      replaced = await uploadSource(sessionId, new File([replacementPng], `replacement-${index}.png`, { type: "image/png" }));
      expect(await findAsset(previous.id)).toBeUndefined();
      expect(await getStorage().exists(previous.storageKey)).toBe(false);
    }
    const remainingSessionAssets = await getDatabase().query.assets.findMany({
      where: eq(assets.ownerSessionId, sessionId)
    });
    expect(remainingSessionAssets).toHaveLength(1);
    expect(remainingSessionAssets[0].id).toBe(replaced.asset.id);

    const confirmed = await confirmSession(sessionId, replaced.row.revision);
    expect(confirmed.row.status).toBe("confirmed");
    expect(confirmed.snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(confirmed.snapshot.design).toMatchObject({
      opticalProfile: {
        id: testProfileId,
        version: 1,
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        generatorVersion: "nominal-raytrace-v1"
      },
      renderer: { id: "reflectcup-cpu-lut", version: 1 }
    });
    const persisted = await getDatabase().query.previewSessions.findFirst({
      where: and(eq(previewSessions.id, sessionId), eq(previewSessions.status, "confirmed"))
    });
    expect(persisted).toBeTruthy();

    const adminLogin = await loginAdmin(testAdminEmail, testAdminPassword, "127.0.0.3");
    const adminSessionsResponse = await listAdminSessionsRoute(
      new NextRequest(`${origin}/api/v1/admin/preview-sessions`, {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminLogin.token}` }
      })
    );
    expect(adminSessionsResponse.status).toBe(200);
    const adminSessionsBody = (await adminSessionsResponse.json()) as {
      data: { sessions: Array<{ id: string; snapshotId: string | null; snapshotRevision: number | null; snapshotChecksum: string | null }> };
    };
    expect(adminSessionsBody.data.sessions.find((item) => item.id === sessionId)).toMatchObject({
      snapshotId: confirmed.snapshot.id,
      snapshotRevision: confirmed.snapshot.revision,
      snapshotChecksum: confirmed.snapshot.checksum
    });

    const productionJob = await queueProductionBundle(confirmed.snapshot.id, testAdminId);
    // Web/API orchestration is enqueue-only: expensive 4K work must not begin
    // until a dedicated worker claims this durable row.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(await getDatabase().query.renderJobs.findFirst({ where: eq(renderJobs.id, productionJob.id) }))
      .toMatchObject({ status: "queued", progress: 0 });
    const runInProductionThread = () => runProductionJobThread({
      entryUrl: pathToFileURL(path.resolve("dist", "workers", "production-job-thread.cjs")),
      job: { id: productionJob.id, actorAdminUserId: testAdminId },
      timeoutMs: 55_000,
      heartbeatIntervalMs: 100,
      heartbeat: heartbeatProductionJob,
      failClaimedJob: markProductionJobFailed
    });
    const competingResults = await Promise.all([runInProductionThread(), runInProductionThread()]);
    expect(competingResults.sort()).toEqual(["not_claimed", "ready"]);
    const completedJob = await getDatabase().query.renderJobs.findFirst({ where: eq(renderJobs.id, productionJob.id) });
    expect(completedJob).toMatchObject({ status: "ready", progress: 100 });
    expect(completedJob?.outputAssetId).toBeTruthy();
    productionAssetIds.push(completedJob!.outputAssetId!);
    const bundleAsset = await findAsset(completedJob!.outputAssetId!);
    expect(bundleAsset?.mimeType).toBe("application/zip");
    const archive = unzipSync(await getStorage().get(bundleAsset!.storageKey));
    expect(Object.keys(archive).sort()).toEqual(
      ["README.txt", "design.json", "manifest.json", "plate-mask.png", "plate-print.png", "proof.png"].sort()
    );
    expect(archive["source.png"]).toBeUndefined();
    expect(await sharp(archive["plate-print.png"]).metadata()).toMatchObject({ width: 4096, height: 4096, format: "png" });
    expect(await sharp(archive["plate-mask.png"]).metadata()).toMatchObject({ width: 4096, height: 4096, format: "png" });
    const manifest = JSON.parse(strFromU8(archive["manifest.json"])) as {
      commit: string;
      output: { pixels: number; dishDiameterMm: number; approximatelyPpi: number };
      opticalProfile: { id: string; version: number; checksum: string; generatorVersion: string };
      files: Record<string, { byteSize: number; mimeType: string; sha256: string }>;
    };
    expect(manifest.commit.length).toBeGreaterThan(0);
    expect(manifest.output).toMatchObject({ pixels: 4096, dishDiameterMm: 182.4924 });
    expect(manifest.output.approximatelyPpi).toBeCloseTo(570.13, 1);
    expect(manifest.opticalProfile).toMatchObject({
      id: testProfileId,
      version: 1,
      checksum: (confirmed.snapshot.design as { opticalProfile: { checksum: string } }).opticalProfile.checksum,
      generatorVersion: "nominal-raytrace-v1"
    });
    for (const [name, descriptor] of Object.entries(manifest.files)) {
      expect(archive[name]).toBeDefined();
      expect(descriptor.byteSize).toBe(archive[name].byteLength);
      expect(descriptor.sha256).toBe(sha256(archive[name]));
    }

    const [staleJob] = await getDatabase()
      .insert(renderJobs)
      .values({
        previewSessionId: sessionId,
        snapshotId: confirmed.snapshot.id,
        kind: "production_bundle",
        status: "running",
        progress: 5,
        input: { size: 4096, actorAdminUserId: testAdminId, leaseToken: "stale-lease" },
        updatedAt: new Date(Date.now() - 10 * 60_000)
      })
      .returning();
    expect(await recoverProductionJobs(new Date(Date.now() - 5 * 60_000))).toBe(1);
    expect(await getDatabase().query.renderJobs.findFirst({ where: eq(renderJobs.id, staleJob.id) }))
      .toMatchObject({ status: "queued", progress: 0 });
    expect(await heartbeatProductionJob(staleJob.id, "stale-lease")).toBe(false);
    await getDatabase()
      .update(renderJobs)
      .set({ status: "running", input: { size: 4096, actorAdminUserId: testAdminId, leaseToken: "new-lease" } })
      .where(eq(renderJobs.id, staleJob.id));
    await markProductionJobFailed(staleJob.id, new Error("late failure from stale worker"), "stale-lease");
    expect(await getDatabase().query.renderJobs.findFirst({ where: eq(renderJobs.id, staleJob.id) }))
      .toMatchObject({ status: "running", input: expect.objectContaining({ leaseToken: "new-lease" }) });
  }, 60_000);

  it("persists only published scenes with optimistic locking and freezes scene provenance", async () => {
    const createResponse = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.67" },
        body: "{}"
      })
    );
    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as {
      data: { session: { id: string; revision: number; sceneId: string } };
    };
    const sessionId = createBody.data.session.id;
    createdSessionIds.push(sessionId);
    expect(createBody.data.session).toMatchObject({ revision: 0, sceneId: "warm-craftsman-home" });
    const cookieName = sessionCookieName(sessionId);
    const editorToken = cookieValue(createResponse.headers.get("set-cookie") ?? "", cookieName);
    const sessionHeaders = { cookie: `${cookieName}=${editorToken}` };

    const saved = await patchSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { ...sessionHeaders, origin, "content-type": "application/json" },
        body: JSON.stringify({ revision: 0, sceneId: "forest-camp-evening" })
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).data.session).toMatchObject({ revision: 1, sceneId: "forest-camp-evening" });

    const refreshed = await getSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, { headers: sessionHeaders }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).data.session).toMatchObject({ revision: 1, sceneId: "forest-camp-evening" });

    const invalid = await patchSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { ...sessionHeaders, origin, "content-type": "application/json" },
        body: JSON.stringify({ revision: 1, sceneId: "unpublished-scene" })
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("VALIDATION_FAILED");

    const conflict = await patchSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { ...sessionHeaders, origin, "content-type": "application/json" },
        body: JSON.stringify({ revision: 0, sceneId: "studio-neutral" })
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("REVISION_CONFLICT");

    const source = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 90, g: 140, b: 40 } }
    }).png().toBuffer();
    const uploaded = await uploadSource(sessionId, new File([source], "scene-test.png", { type: "image/png" }));
    const rendered = await createPreviewRender(sessionId, uploaded.row.revision);
    const temporarilyChanged = await patchSession(sessionId, {
      revision: rendered.session.revision,
      sceneId: "studio-neutral"
    });
    expect(temporarilyChanged.previewAssetId).toBe(rendered.asset.id);
    const restored = await patchSession(sessionId, {
      revision: temporarilyChanged.revision,
      sceneId: "forest-camp-evening"
    });
    expect(restored.previewAssetId).toBe(rendered.asset.id);
    const confirmed = await confirmSession(sessionId, restored.revision);
    const publishedScene = findPublishedScene("forest-camp-evening")!;
    expect(confirmed.snapshot.design).toMatchObject({
      sceneId: publishedScene.id,
      sceneVersion: publishedScene.version,
      sceneChecksum: publishedScene.checksum
    });
    expect(confirmed.snapshot.checksum).toMatch(/^[0-9a-f]{64}$/);
    const productionJob = await queueProductionBundle(confirmed.snapshot.id, testAdminId);
    expect(productionJob.input).toEqual({ size: 4096, actorAdminUserId: testAdminId });
  });

  it("rejects cross-origin session creation", async () => {
    const response = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: "{}"
      })
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN_REJECTED");
  });

  it("persists a hashed-IP rolling limit and rejects the thirty-first anonymous session", async () => {
    const address = "203.0.113.77";
    const ipHash = hashClientAddress(address);
    await getDatabase()
      .delete(auditLogs)
      .where(and(eq(auditLogs.action, "preview_session.created"), eq(auditLogs.ipHash, ipHash)));

    for (let index = 0; index < 30; index += 1) {
      const response = await createSessionRoute(
        new NextRequest(`${origin}/api/v1/preview-sessions`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", "x-forwarded-for": address },
          body: "{}"
        })
      );
      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { session: { id: string } } };
      createdSessionIds.push(body.data.session.id);
    }

    const limited = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": address },
        body: "{}"
      })
    );
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe("SESSION_RATE_LIMITED");
    const audits = await getDatabase().query.auditLogs.findMany({
      where: and(eq(auditLogs.action, "preview_session.created"), eq(auditLogs.ipHash, ipHash))
    });
    expect(audits).toHaveLength(30);
    expect(audits.every((entry) => entry.targetId && createdSessionIds.includes(entry.targetId))).toBe(true);
  }, 60_000);

  it("expires stale drafts and removes their private source and access tokens", async () => {
    const response = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.88" },
        body: "{}"
      })
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { session: { id: string } } };
    const sessionId = body.data.session.id;
    createdSessionIds.push(sessionId);
    const accessCookieName = sessionCookieName(sessionId);
    const accessToken = cookieValue(response.headers.get("set-cookie") ?? "", accessCookieName);
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } }
    }).png().toBuffer();
    const uploaded = await uploadSource(sessionId, new File([image], "expire.png", { type: "image/png" }));
    await getDatabase()
      .update(previewSessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(previewSessions.id, sessionId));

    const expiredAccess = await getSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions/${sessionId}`, {
        headers: { cookie: `${accessCookieName}=${accessToken}` }
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );
    expect(expiredAccess.status).toBe(410);
    expect(await getStorage().exists(uploaded.asset.storageKey)).toBe(true);

    const expired = await expireStaleSessions(new Date(), 10);
    expect(expired.find((result) => result.sessionId === sessionId)).toMatchObject({ removedAssets: 1, storageFailures: 0 });
    expect(await getDatabase().query.previewSessions.findFirst({ where: eq(previewSessions.id, sessionId) }))
      .toMatchObject({ status: "expired", sourceAssetId: null, previewAssetId: null });
    expect(await findAsset(uploaded.asset.id)).toBeUndefined();
    expect(await getStorage().exists(uploaded.asset.storageKey)).toBe(false);
    expect(await getDatabase().query.previewAccessTokens.findMany({
      where: eq(previewAccessTokens.previewSessionId, sessionId)
    })).toHaveLength(0);
  });

  it("commits retention cleanup while a failed object delete remains durably retryable", async () => {
    const response = await createSessionRoute(
      new NextRequest(`${origin}/api/v1/preview-sessions`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-forwarded-for": "198.51.100.89" },
        body: "{}"
      })
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { session: { id: string } } };
    const sessionId = body.data.session.id;
    createdSessionIds.push(sessionId);
    const image = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 120, g: 30, b: 70 } }
    }).png().toBuffer();
    const uploaded = await uploadSource(sessionId, new File([image], "retry.png", { type: "image/png" }));
    await getDatabase()
      .update(previewSessions)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(previewSessions.id, sessionId));

    const expired = await expireStaleSessions(new Date(), 10, {
      async delete(key: string) {
        expect(key).toBe(uploaded.asset.storageKey);
        throw new Error("injected retention storage outage");
      }
    });
    expect(expired.find((result) => result.sessionId === sessionId)).toMatchObject({
      removedAssets: 1,
      storageFailures: 1
    });
    expect(await findAsset(uploaded.asset.id)).toBeUndefined();
    expect(await getStorage().exists(uploaded.asset.storageKey)).toBe(true);
    const pending = await getDatabase().query.storageDeletionOutbox.findFirst({
      where: eq(storageDeletionOutbox.storageKey, uploaded.asset.storageKey)
    });
    expect(pending).toMatchObject({ attempts: 1, completedAt: null, lastError: "injected retention storage outage" });

    const retried = await processStorageDeletionOutbox({
      now: pending!.nextAttemptAt,
      limit: 1,
      storage: getStorage()
    });
    expect(retried).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(await getStorage().exists(uploaded.asset.storageKey)).toBe(false);
    await getDatabase().delete(storageDeletionOutbox).where(eq(storageDeletionOutbox.id, pending!.id));
  });
});

describe("durable storage deletion", () => {
  it("leases a tombstone, persists a transient failure, and retries idempotently", async () => {
    const storageKey = `fault-injection/${Date.now()}.bin`;
    const initialAttempt = new Date("2000-01-01T00:00:00.000Z");
    const [intent] = await getDatabase()
      .insert(storageDeletionOutbox)
      .values({ storageKey, reason: "fault_injection", nextAttemptAt: initialAttempt })
      .returning();
    let deleteCalls = 0;
    const flakyStorage = {
      async delete(key: string) {
        expect(key).toBe(storageKey);
        deleteCalls += 1;
        if (deleteCalls === 1) throw new Error("injected temporary storage failure");
      }
    };
    try {
      const first = await processStorageDeletionOutbox({ now: initialAttempt, limit: 1, storage: flakyStorage });
      expect(first).toEqual({ claimed: 1, completed: 0, failed: 1 });
      const failed = await getDatabase().query.storageDeletionOutbox.findFirst({
        where: eq(storageDeletionOutbox.id, intent.id)
      });
      expect(failed).toMatchObject({ attempts: 1, completedAt: null, lastError: "injected temporary storage failure" });
      expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(initialAttempt.getTime());

      expect(await processStorageDeletionOutbox({
        now: new Date(failed!.nextAttemptAt.getTime() - 1),
        limit: 1,
        storage: flakyStorage
      })).toEqual({ claimed: 0, completed: 0, failed: 0 });

      const second = await processStorageDeletionOutbox({
        now: failed!.nextAttemptAt,
        limit: 1,
        storage: flakyStorage
      });
      expect(second).toEqual({ claimed: 1, completed: 1, failed: 0 });
      expect(deleteCalls).toBe(2);
      expect(await getDatabase().query.storageDeletionOutbox.findFirst({
        where: eq(storageDeletionOutbox.id, intent.id)
      })).toMatchObject({ attempts: 2, completedAt: failed!.nextAttemptAt, lastError: null });

      expect(await processStorageDeletionOutbox({
        now: new Date(failed!.nextAttemptAt.getTime() + 60_000),
        limit: 1,
        storage: flakyStorage
      })).toEqual({ claimed: 0, completed: 0, failed: 0 });

      await enqueueStorageDeletions([{ storageKey, reason: "key_reused" }]);
      expect(await getDatabase().query.storageDeletionOutbox.findFirst({
        where: eq(storageDeletionOutbox.id, intent.id)
      })).toMatchObject({ reason: "key_reused", attempts: 0, completedAt: null });
      expect(await processStorageDeletionOutbox({ limit: 1, storage: flakyStorage }))
        .toEqual({ claimed: 1, completed: 1, failed: 0 });
      expect(deleteCalls).toBe(3);
    } finally {
      await getDatabase().delete(storageDeletionOutbox).where(eq(storageDeletionOutbox.id, intent.id));
    }
  });
});

describe("administrator authentication", () => {
  it("uses Argon2id credentials and an opaque, revocable HttpOnly session", async () => {
    const login = await loginAdmin(testAdminEmail, testAdminPassword, "127.0.0.2");
    expect(login.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(login.principal.role).toBe("owner");
    const persisted = await getDatabase().query.adminSessions.findFirst({
      where: eq(adminSessions.adminUserId, testAdminId)
    });
    expect(persisted?.tokenHash).not.toBe(login.token);

    const principal = await authenticateAdmin(
      new NextRequest(`${origin}/api/v1/admin/me`, {
        headers: { cookie: `${ADMIN_COOKIE_NAME}=${login.token}` }
      })
    );
    expect(principal.id).toBe(testAdminId);
  });

  it("enforces independent email and IP failure budgets before password verification", async () => {
    const db = getDatabase();
    const createdAttemptIds: string[] = [];
    const emailLimitedAddress = "198.51.100.201";
    const ipLimitedAddress = "198.51.100.202";
    try {
      const emailRows = await db
        .insert(loginAttempts)
        .values(
          Array.from({ length: ADMIN_LOGIN_LIMITS.email.attempts }, (_, index) => ({
            normalizedEmail: testAdminEmail,
            ipHash: hashClientAddress(`198.51.101.${index + 1}`),
            succeeded: false
          }))
        )
        .returning({ id: loginAttempts.id });
      createdAttemptIds.push(...emailRows.map((row) => row.id));

      await expect(loginAdmin(testAdminEmail, testAdminPassword, emailLimitedAddress)).rejects.toMatchObject({
        status: 429,
        code: "LOGIN_RATE_LIMITED"
      });

      const sharedIpHash = hashClientAddress(ipLimitedAddress);
      const ipRows = await db
        .insert(loginAttempts)
        .values(
          Array.from({ length: ADMIN_LOGIN_LIMITS.ip.attempts }, (_, index) => ({
            normalizedEmail: `random-${Date.now()}-${index}@example.com`,
            ipHash: sharedIpHash,
            succeeded: false
          }))
        )
        .returning({ id: loginAttempts.id });
      createdAttemptIds.push(...ipRows.map((row) => row.id));

      await expect(
        loginAdmin(`unrelated-${Date.now()}@example.com`, "definitely-wrong", ipLimitedAddress)
      ).rejects.toMatchObject({ status: 429, code: "LOGIN_RATE_LIMITED" });
    } finally {
      if (createdAttemptIds.length > 0) {
        await db.delete(loginAttempts).where(inArray(loginAttempts.id, createdAttemptIds));
      }
    }
  });

  it("atomically reserves the last email budget slot under concurrent requests", async () => {
    const db = getDatabase();
    const unique = Date.now();
    const email = `concurrent-login-${unique}@example.com`;
    const createdAttemptIds: string[] = [];
    try {
      const seeded = await db
        .insert(loginAttempts)
        .values(
          Array.from({ length: ADMIN_LOGIN_LIMITS.email.attempts - 1 }, (_, index) => ({
            normalizedEmail: email,
            ipHash: hashClientAddress(`203.0.112.${index + 1}`),
            succeeded: false
          }))
        )
        .returning({ id: loginAttempts.id });
      createdAttemptIds.push(...seeded.map((row) => row.id));

      const results = await Promise.allSettled([
        loginAdmin(email, "wrong-password", "203.0.113.201"),
        loginAdmin(email, "wrong-password", "203.0.113.202")
      ]);
      const codes = results
        .map((result) => (result.status === "rejected" ? (result.reason as { code?: string }).code : "unexpected-success"))
        .sort();
      expect(codes).toEqual(["INVALID_CREDENTIALS", "LOGIN_RATE_LIMITED"]);

      const attempts = await db.query.loginAttempts.findMany({
        where: eq(loginAttempts.normalizedEmail, email)
      });
      createdAttemptIds.push(...attempts.map((row) => row.id).filter((id) => !createdAttemptIds.includes(id)));
      expect(attempts).toHaveLength(ADMIN_LOGIN_LIMITS.email.attempts);
      expect(attempts.every((attempt) => !attempt.succeeded)).toBe(true);
    } finally {
      if (createdAttemptIds.length > 0) {
        await db.delete(loginAttempts).where(inArray(loginAttempts.id, createdAttemptIds));
      }
    }
  });
});

describe("administrator optical profile validation", () => {
  it("rejects session-owned assets and validates a profile before create and publish", async () => {
    const sourceMaskAsset = await getDatabase().query.assets.findFirst({ where: eq(assets.id, profileAssetIds[1]) });
    expect(sourceMaskAsset).toBeTruthy();
    const maskBytes = await getStorage().get(sourceMaskAsset!.storageKey);
    const ownedMaskKey = `test/owned-mask-${Date.now()}.r8`;
    await getStorage().put(ownedMaskKey, maskBytes);
    const [ownedMaskAsset] = await getDatabase()
      .insert(assets)
      .values({
        ownerSessionId: createdSessionIds[0],
        kind: "optical-mask",
        storageKey: ownedMaskKey,
        mimeType: "application/octet-stream",
        byteSize: maskBytes.byteLength,
        sha256: sha256(maskBytes)
      })
      .returning();
    profileAssetIds.push(ownedMaskAsset.id);

    const unique = Date.now();
    const generated = generateOpticalProfile({
      ...createNominalOpticalProfile({ status: "draft", targetSamples: [65, 65], lutSize: [256, 256] }),
      id: `admin-profile-${unique}`,
      slug: `admin-profile-${unique}`,
      label: "Validated admin profile"
    });
    const badShaMaskKey = `test/bad-sha-mask-${unique}.r8`;
    await getStorage().put(badShaMaskKey, maskBytes);
    const [badShaMaskAsset] = await getDatabase()
      .insert(assets)
      .values({
        kind: "optical-mask",
        storageKey: badShaMaskKey,
        mimeType: "application/octet-stream",
        byteSize: maskBytes.byteLength,
        sha256: "0".repeat(64)
      })
      .returning();
    profileAssetIds.push(badShaMaskAsset.id);
    await expect(
      validateOpticalProfileCandidate({
        document: generated.profile,
        lutAssetId: profileAssetIds[0],
        maskAssetId: badShaMaskAsset.id
      })
    ).rejects.toMatchObject({ code: "PROFILE_VALIDATION_FAILED", status: 422 });

    await expect(
      validateOpticalProfileCandidate({
        document: generated.profile,
        lutAssetId: profileAssetIds[0],
        maskAssetId: ownedMaskAsset.id,
        identity: {
          slug: generated.profile.slug,
          label: generated.profile.label,
          version: generated.profile.version,
          status: generated.profile.status
        }
      })
    ).rejects.toMatchObject({ code: "PROFILE_VALIDATION_FAILED", status: 422 });

    const login = await loginAdmin(testAdminEmail, testAdminPassword, "127.0.0.4");
    const cookie = `${ADMIN_COOKIE_NAME}=${login.token}`;
    const invalidCreate = await createAdminProfileRoute(
      new NextRequest(`${origin}/api/v1/admin/optical-profiles`, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({
          slug: generated.profile.slug,
          label: generated.profile.label,
          profile: generated.profile,
          lutAssetId: profileAssetIds[0],
          maskAssetId: ownedMaskAsset.id
        })
      })
    );
    expect(invalidCreate.status).toBe(422);

    const validCreate = await createAdminProfileRoute(
      new NextRequest(`${origin}/api/v1/admin/optical-profiles`, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({
          slug: generated.profile.slug,
          label: generated.profile.label,
          profile: generated.profile,
          lutAssetId: profileAssetIds[0],
          maskAssetId: profileAssetIds[1]
        })
      })
    );
    expect(validCreate.status).toBe(201);
    const createdBody = (await validCreate.json()) as { data: { profile: { id: string; status: string } } };
    adminCreatedProfileIds.push(createdBody.data.profile.id);
    expect(createdBody.data.profile.status).toBe("draft");

    const published = await patchAdminProfileRoute(
      new NextRequest(`${origin}/api/v1/admin/optical-profiles/${createdBody.data.profile.id}`, {
        method: "PATCH",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "published" })
      }),
      { params: Promise.resolve({ id: createdBody.data.profile.id }) }
    );
    expect(published.status).toBe(200);
    const publishedProfile = (await published.json()).data.profile as {
      status: string;
      checksum: string;
      profile: { status: string };
    };
    expect(publishedProfile.status).toBe("published");
    expect(publishedProfile.profile.status).toBe("published");

    const retired = await patchAdminProfileRoute(
      new NextRequest(`${origin}/api/v1/admin/optical-profiles/${createdBody.data.profile.id}`, {
        method: "PATCH",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "retired" })
      }),
      { params: Promise.resolve({ id: createdBody.data.profile.id }) }
    );
    expect(retired.status).toBe(200);
    const retiredProfile = (await retired.json()).data.profile as {
      status: string;
      checksum: string;
      profile: { status: string };
    };
    expect(retiredProfile.status).toBe("retired");
    expect(retiredProfile.profile.status).toBe("published");
    expect(retiredProfile.checksum).toBe(publishedProfile.checksum);

    const cloned = await createAdminProfileRoute(
      new NextRequest(`${origin}/api/v1/admin/optical-profiles`, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify({ sourceProfileId: createdBody.data.profile.id })
      })
    );
    expect(cloned.status).toBe(201);
    const clonedProfile = (await cloned.json()).data.profile as {
      id: string;
      status: string;
      version: number;
      lutAssetId: string;
      maskAssetId: string;
    };
    adminCreatedProfileIds.push(clonedProfile.id);
    expect(clonedProfile).toMatchObject({
      status: "draft",
      version: 2,
      lutAssetId: profileAssetIds[0],
      maskAssetId: profileAssetIds[1]
    });
  }, 30_000);
});

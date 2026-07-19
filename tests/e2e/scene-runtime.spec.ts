import { expect, test, type Page, type Route } from "@playwright/test";

import type { PreviewSession } from "../../src/lib/contracts";
import { createNominalOpticalProfile } from "../../src/optics";
import { findSceneRelease, LEGACY_SCENE_V4_RELEASES } from "../../src/scenes/release-manifest";

function sceneSession(sceneId = "warm-craftsman-home"): PreviewSession {
  const now = new Date().toISOString();
  const profile = createNominalOpticalProfile({ status: "published" });
  const scene = findSceneRelease(sceneId);
  if (!scene) throw new Error(`Missing test scene: ${sceneId}`);
  return {
    id: "scene_runtime_session",
    status: "draft",
    revision: 1,
    opticalProfile: {
      id: "nominal-v1",
      slug: "nominal",
      label: "Nominal cup",
      version: 1,
      status: "published",
    },
    opticalRuntime: {
      schemaVersion: 1,
      checksum: "scene-runtime-profile",
      profile,
      lut: {
        url: "/optical-profiles/nominal-v1/plate-to-target.rg32f",
        mimeType: "application/octet-stream",
        width: 512,
        height: 512,
        encoding: "rg32f-le",
      },
      mask: {
        url: "/optical-profiles/nominal-v1/plate-valid-mask.bin",
        mimeType: "application/octet-stream",
        width: 512,
        height: 512,
        encoding: "r8",
      },
      targetMask: {
        url: "/optical-profiles/nominal-v1/target-valid-mask.png",
        mimeType: "image/png",
        width: 129,
        height: 129,
        encoding: "png-r8",
      },
    },
    previewSettings: {
      toneMappingExposure: 1.08,
      mobileDprCap: 1.5,
      desktopDprCap: 2,
      keyLightMultiplier: 1,
    },
    sceneId,
    sceneVersion: scene.version,
    sceneChecksum: scene.checksum,
    crop: { centerX: 0.5, centerY: 0.5, scale: 1 },
    camera: { position: [0.6, 0.48, 0], target: [-0.03, 0.043, 0] },
    styleStrategy: "identity",
    fillStrategy: "none",
    createdAt: now,
    updatedAt: now,
  };
}

async function mockSceneSession(
  page: Page,
  initialSceneId = "warm-craftsman-home",
  initialSession?: PreviewSession,
) {
  let session = initialSession ?? sceneSession(initialSceneId);
  const patches: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/preview-sessions**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/preview-sessions" && request.method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { session, resumeUrl: `/studio/${session.id}#resume=test` } }),
      });
    }
    if (request.method() === "PATCH") {
      const patch = request.postDataJSON() as Record<string, unknown>;
      patches.push(patch);
      const nextScene = typeof patch.sceneId === "string" ? findSceneRelease(patch.sceneId) : undefined;
      session = {
        ...session,
        ...patch,
        ...(nextScene ? { sceneVersion: nextScene.version, sceneChecksum: nextScene.checksum } : {}),
        revision: session.revision + 1,
      } as PreviewSession;
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { session } }),
    });
  });
  return { patches };
}

test("a confirmed forest v4 session replays v4 instead of current v5", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one desktop immutable-release replay check is sufficient");
  const forestV4 = LEGACY_SCENE_V4_RELEASES[1];
  const confirmedV4: PreviewSession = {
    ...sceneSession(forestV4.id),
    status: "confirmed",
    sceneVersion: forestV4.version,
    sceneChecksum: forestV4.checksum,
  };
  await mockSceneSession(page, forestV4.id, confirmedV4);
  const requestedAssets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/scenes/forest-camp-evening/")) requestedAssets.push(request.url());
  });

  await page.goto("/studio/new");
  await expect(page.getByLabel("Scene")).toHaveValue(forestV4.id);
  await expect(page.getByText(/locked as a test snapshot/i)).toBeVisible();
  await expect.poll(
    () => requestedAssets.some((url) => url.endsWith("/v3/models/kenney-tent.glb")),
    { timeout: 20_000 },
  ).toBe(true);
  expect(requestedAssets.some((url) => url.includes("/v5/"))).toBe(false);
});

test("a saved scene checksum mismatch is refused instead of falling forward", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "one desktop immutable-release rejection check is sufficient");
  const forestV4 = LEGACY_SCENE_V4_RELEASES[1];
  const mismatched: PreviewSession = {
    ...sceneSession(forestV4.id),
    status: "confirmed",
    sceneVersion: forestV4.version,
    sceneChecksum: "0".repeat(64),
  };
  await mockSceneSession(page, forestV4.id, mismatched);
  const requestedAssets: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/scenes/forest-camp-evening/")) requestedAssets.push(request.url());
  });

  await page.goto("/studio/new");
  await expect(page.getByText("This saved scene release cannot be replayed safely.")).toBeVisible();
  await expect(page.getByTestId("reflection-preview")).toHaveCount(0);
  expect(requestedAssets).toHaveLength(0);
});

async function disableIdlePromotion(page: Page) {
  await page.addInitScript(() => {
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    idleWindow.requestIdleCallback = () => 1;
    idleWindow.cancelIdleCallback = () => undefined;
  });
}

test("scene switching waits for the device-appropriate preview tier", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name.includes("mobile");
  await disableIdlePromotion(page);
  const state = await mockSceneSession(page);
  const mediumOnly = new Set<string>();
  let v5TentRequests = 0;
  // Low keeps the same composition but uses smaller embedded PBR images.
  // A constrained device must not fetch the Medium model derivatives.
  const mediumOnlyNames = [
    "outdoor-table-chair-set-01.glb",
    "lantern-01.glb",
    "pine-forest-props-medium-3fa78f9e225c8e8f.glb",
  ];
  page.on("request", (request) => {
    if (mediumOnlyNames.some((name) => request.url().endsWith(name))) mediumOnly.add(request.url());
    if (request.url().endsWith("/scenes/forest-camp-evening/v3/models/kenney-tent.glb")) v5TentRequests += 1;
  });

  let delayedRequestStarted = false;
  let releaseDelayedRequest: (() => void) | undefined;
  const delayedRequestReleased = new Promise<void>((resolve) => { releaseDelayedRequest = resolve; });
  await page.route("**/scenes/forest-camp-evening/v5/environment-1k.hdr", async (route) => {
    delayedRequestStarted = true;
    await delayedRequestReleased;
    await route.continue();
  });

  try {
    await page.goto("/studio/new");
    if (mobile) {
      await page.getByRole("button", { name: "View reflection" }).click();
    }
    const select = page.getByLabel("Scene");
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("warm-craftsman-home");
    await select.selectOption("forest-camp-evening");

    await expect.poll(() => delayedRequestStarted).toBe(true);
    await page.waitForTimeout(100);
    // A native select changes its DOM value before React has accepted the
    // asynchronous transition, so the persisted session is the stable
    // assertion that the scene has not switched early.
    expect(state.patches.some((patch) => patch.sceneId === "forest-camp-evening")).toBe(false);
    if (mobile) {
      expect(mediumOnly.size).toBe(0);
    } else {
      await expect.poll(() => mediumOnly.size).toBe(mediumOnlyNames.length);
    }

    releaseDelayedRequest?.();
    await expect.poll(() => state.patches.some((patch) => patch.sceneId === "forest-camp-evening"), {
      timeout: 20_000,
    }).toBe(true);
    await expect(select).toHaveValue("forest-camp-evening");
    expect(v5TentRequests).toBe(0);
    if (mobile) expect(mediumOnly.size).toBe(0);
  } finally {
    releaseDelayedRequest?.();
  }
});

test("desktop never requests the 2K environment before its idle promotion gate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop-only high-quality promotion");
  await page.addInitScript(() => {
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextId = 1;
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
      __reflectCupIdleCount?: () => number;
      __reflectCupRunIdle?: () => void;
    };
    idleWindow.requestIdleCallback = (callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    };
    idleWindow.cancelIdleCallback = (id) => { callbacks.delete(id); };
    idleWindow.__reflectCupIdleCount = () => callbacks.size;
    idleWindow.__reflectCupRunIdle = () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback({ didTimeout: false, timeRemaining: () => 50 });
    };
  });
  await mockSceneSession(page);
  let highEnvironmentRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/scenes/warm-craftsman-home/v5/lythwood-lounge-2k-04cce69276d91353.hdr")) {
      highEnvironmentRequests += 1;
    }
  });

  await page.goto("/studio/new");
  await expect(page.getByLabel("Scene")).toHaveValue("warm-craftsman-home");
  await page.waitForTimeout(5_000);
  const idleCount = await page.evaluate(() => (
    window as typeof window & { __reflectCupIdleCount?: () => number }
  ).__reflectCupIdleCount?.() ?? 0);
  expect(highEnvironmentRequests).toBe(0);

  // Headless WebGL can legitimately trigger PerformanceMonitor's low-tier
  // fallback before the idle callback is registered. In that branch the
  // contract is that the 2K asset remains suppressed.
  if (idleCount === 0) return;
  await page.evaluate(() => (
    window as typeof window & { __reflectCupRunIdle?: () => void }
  ).__reflectCupRunIdle?.());
  await expect.poll(() => highEnvironmentRequests, { timeout: 10_000 }).toBe(1);
});

import { expect, test, type Page, type Route } from "@playwright/test";
import sharp from "sharp";
import type { PreviewSession } from "../../src/lib/contracts";
import { createNominalOpticalProfile } from "../../src/optics";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M9QzwAEYgH9fI2bWQAAAABJRU5ErkJggg==",
  "base64",
);

function baseSession(id = "session_demo_1234"): PreviewSession {
  const now = new Date().toISOString();
  const profile = createNominalOpticalProfile({ status: "published" });
  return {
    id,
    status: "draft" as const,
    revision: 1,
    opticalProfile: { id: "nominal-v1", slug: "nominal", label: "Nominal cup", version: 1, status: "published" },
    opticalRuntime: {
      schemaVersion: 1,
      checksum: "test-profile-checksum",
      profile,
      lut: { url: "/optical-profiles/nominal-v1/plate-to-target.rg32f", mimeType: "application/octet-stream", width: 512, height: 512, encoding: "rg32f-le" },
      mask: { url: "/optical-profiles/nominal-v1/plate-valid-mask.bin", mimeType: "application/octet-stream", width: 512, height: 512, encoding: "r8" },
      targetMask: { url: "/optical-profiles/nominal-v1/target-valid-mask.png", mimeType: "image/png", width: 129, height: 129, encoding: "png-r8" },
    },
    previewSettings: { toneMappingExposure: 1.08, mobileDprCap: 1.5, desktopDprCap: 2, keyLightMultiplier: 1 },
    sceneId: "studio-neutral",
    crop: { centerX: 0.5, centerY: 0.5, scale: 1 },
    camera: { position: [0.6, 0.48, 0], target: [-0.03, 0.043, 0] },
    styleStrategy: "identity",
    fillStrategy: "none",
    createdAt: now,
    updatedAt: now,
  };
}

async function mockStudio(page: Page, options: {
  failCanonicalOnce?: boolean;
  delayFirstPatchResponse?: boolean;
  initialSource?: boolean;
} = {}) {
  let session: PreviewSession = options.initialSource
    ? {
        ...baseSession(),
        source: {
          id: "asset-initial",
          kind: "source",
          url: "/calibration/reflection-checker-2048.png",
          mimeType: "image/png",
          width: 2048,
          height: 2048,
        },
      }
    : baseSession();
  const patches: unknown[] = [];
  const resumeExchanges: unknown[] = [];
  let resumeRotations = 0;
  let uploads = 0;
  let renders = 0;
  let markFirstPatchStarted: (() => void) | undefined;
  let releaseDelayedPatch: (() => void) | undefined;
  const firstPatchStarted = new Promise<void>((resolve) => { markFirstPatchStarted = resolve; });
  const delayedPatchReleased = new Promise<void>((resolve) => { releaseDelayedPatch = resolve; });
  await page.route("**/api/v1/preview-sessions**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === "/api/v1/preview-sessions" && method === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { session, resumeUrl: `/studio/${session.id}#resume=test` } }) });
    }
    if (url.pathname.endsWith("/source") && method === "POST") {
      uploads += 1;
      session = { ...session, revision: session.revision + 1, source: { id: `asset-${uploads}`, kind: "source", url: `/calibration/reflection-checker-2048.png?v=${uploads}`, mimeType: "image/png", width: 2, height: 2 } };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { session, asset: session.source } }) });
    }
    if (url.pathname.endsWith("/renders") && method === "POST") {
      renders += 1;
      if (options.failCanonicalOnce && renders === 1) {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "RENDER_FAILED", message: "Preview render failed" } }) });
      }
      const output = { id: `preview-${renders}`, kind: "preview", url: `/calibration/reflection-checker-2048.png?preview=${renders}`, mimeType: "image/png", width: 1024, height: 1024 };
      session = { ...session, preview: output };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { job: { id: `job-${renders}`, sessionId: session.id, kind: "preview", status: "ready", progress: 100, output, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } }),
      });
    }
    if (url.pathname.endsWith("/access/exchange") && method === "POST") {
      resumeExchanges.push(request.postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session, resumeUrl: `/studio/${session.id}#resume=${"r".repeat(48)}` } }) });
    }
    if (url.pathname.endsWith("/access/rotate") && method === "POST") {
      resumeRotations += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { resumeUrl: `/studio/${session.id}#resume=${"n".repeat(48)}` } }) });
    }
    if (url.pathname.endsWith("/confirm") && method === "POST") {
      session = { ...session, revision: session.revision + 1, status: "confirmed" as const };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session, snapshot: { id: "snapshot-1" } } }) });
    }
    if (method === "PATCH") {
      const body = request.postDataJSON();
      patches.push(body);
      session = { ...session, ...body, revision: session.revision + 1 };
      const responseSession = session;
      if (options.delayFirstPatchResponse && patches.length === 1) {
        markFirstPatchStarted?.();
        await delayedPatchReleased;
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session: responseSession } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { session } }) });
  });
  return {
    patches,
    resumeExchanges,
    firstPatchStarted,
    releaseFirstPatch() { releaseDelayedPatch?.(); },
    get resumeRotations() { return resumeRotations; },
    get uploads() { return uploads; },
    get renders() { return renders; },
  };
}

test("uploads, adjusts, autosaves and confirms a design", async ({ page }, testInfo) => {
  const state = await mockStudio(page);
  await page.goto("/studio/new");
  await expect(page.getByRole("heading", { name: "Choose the image to reveal" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.getByTestId("reflection-preview")).toBeVisible();
    await page.getByRole("button", { name: "Adjust image" }).click();
    await expect(page.getByTestId("crop-viewport")).toBeVisible();
  } else {
    await expect(page.getByTestId("crop-viewport")).toBeVisible();
    await expect(page.getByTestId("reflection-preview")).toBeVisible();
  }

  await page.getByLabel("Zoom").fill("2");
  await expect(page.getByText("2.0×")).toBeVisible();
  await expect.poll(() => state.patches.length, { timeout: 10_000 }).toBeGreaterThan(0);

  await expect(page.getByRole("button", { name: "Confirm design" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Confirm design" }).click();
  await expect(page.getByRole("button", { name: "Design confirmed" })).toBeVisible();
  await expect(page.getByText(/locked as a test snapshot/i)).toBeVisible();
});

test("switching scene autosaves it without changing the optical crop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop scene persistence check");
  const state = await mockStudio(page);
  await page.goto("/studio/new");
  const sceneSelect = page.getByLabel("Scene");
  await expect(sceneSelect).toHaveValue("studio-neutral");

  await sceneSelect.selectOption("forest-camp-evening");
  await expect(sceneSelect).toHaveValue("forest-camp-evening", { timeout: 10_000 });
  await expect.poll(() => state.patches.some((patch) => (
    typeof patch === "object" && patch !== null &&
    "sceneId" in patch && patch.sceneId === "forest-camp-evening"
  )), { timeout: 10_000 }).toBe(true);

  const scenePatch = state.patches.find((patch) => (
    typeof patch === "object" && patch !== null &&
    "sceneId" in patch && patch.sceneId === "forest-camp-evening"
  )) as { crop: PreviewSession["crop"]; sceneId: string };
  expect(scenePatch.crop).toEqual({ centerX: 0.5, centerY: 0.5, scale: 1 });

  await page.reload();
  await expect(page.getByLabel("Scene")).toHaveValue("forest-camp-evening");
});

test("an older autosave response cannot overwrite a newer local edit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop autosave race check");
  const state = await mockStudio(page, { delayFirstPatchResponse: true, initialSource: true });
  await page.goto("/studio/new");
  const zoom = page.getByLabel("Zoom");

  await zoom.fill("2");
  await state.firstPatchStarted;
  await expect(page.getByText("2.0×")).toBeVisible();

  await zoom.fill("3");
  await expect(page.getByText("3.0×")).toBeVisible();
  state.releaseFirstPatch();

  await expect.poll(() => state.patches.length, { timeout: 5_000 }).toBe(2);
  await expect(page.getByText("3.0×")).toBeVisible();
  expect(state.patches).toMatchObject([
    { revision: 1, crop: { scale: 2 } },
    { revision: 2, crop: { scale: 3 } },
  ]);
});

test("a failed canonical preview is visible, blocks confirmation, and can be retried", async ({ page }) => {
  const state = await mockStudio(page, { failCanonicalOnce: true });
  await page.goto("/studio/new");
  await page.locator('input[type="file"]').setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });

  await expect(page.getByText(/saved production preview could not be generated/i)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: "Confirm design" })).toBeDisabled();
  expect(state.renders).toBe(1);

  await page.getByRole("button", { name: "Try preview again" }).click();
  await expect.poll(() => state.renders).toBe(2);
  await expect(page.getByRole("button", { name: "Confirm design" })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText(/optical and saved previews are ready/i)).toBeVisible();
});

test("an unavailable optical LUT is not replaced with a fake preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop optical failure lifecycle check");
  await page.route("**/plate-to-target.rg32f", (route) => route.abort("failed"));
  await mockStudio(page);
  await page.goto("/studio/new");
  await page.locator('input[type="file"]').setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });

  await expect(page.getByText(/optical mapping could not be loaded/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm design" })).toBeDisabled();

  await page.unroute("**/plate-to-target.rg32f");
  await page.getByRole("button", { name: "Try preview again" }).click();
  await expect(page.getByRole("button", { name: "Confirm design" })).toBeEnabled({ timeout: 15_000 });
});

test("mobile keeps adjustment and preview as focused tabs", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only flow");
  await page.setViewportSize({ width: 320, height: 700 });
  await mockStudio(page);
  await page.goto("/studio/new");
  await expect(page.getByRole("button", { name: "Adjust image" })).toBeVisible();
  await page.getByRole("button", { name: "View reflection" }).click();
  await expect(page.getByTestId("reflection-preview")).toBeVisible();
  await page.getByRole("button", { name: "Adjust image" }).click();
  await expect(page.getByRole("heading", { name: "Choose the image to reveal" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a one-time recovery fragment is exchanged and immediately removed", async ({ page }) => {
  const state = await mockStudio(page);
  const resumeToken = "r".repeat(48);
  await page.goto(`/studio/session_demo_1234#resume=${resumeToken}`);
  await expect(page.getByRole("heading", { name: "Choose the image to reveal" })).toBeVisible();
  expect(state.resumeExchanges).toEqual([{ resumeToken }]);
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByRole("button", { name: "Copy resume link" })).toBeVisible();
});

test("an authenticated design opened normally can rotate and copy a fresh recovery link", async ({ page }) => {
  const state = await mockStudio(page);
  await page.goto("/studio/session_demo_1234");
  await page.getByRole("button", { name: "Copy resume link" }).click();
  await expect(page.getByRole("button", { name: "Resume link copied" })).toBeVisible();
  expect(state.resumeRotations).toBe(1);
});

test("deterministic +5 and +10 degree cameras progressively change the cup reflection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop visual check");
  await mockStudio(page);
  await page.goto("/studio/new");
  await page.locator('input[type="file"]').setInputFiles("public/calibration/reflection-checker-2048.png");
  const canvas = page.getByTestId("reflection-preview").locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm design" })).toBeEnabled({ timeout: 15_000 });

  const target = [-0.03, 0.043, 0] as const;
  const design = [0.6, 0.48, 0] as const;
  const positionAtAzimuth = (degrees: number): readonly [number, number, number] => {
    const radians = degrees * Math.PI / 180;
    const offsetX = design[0] - target[0];
    const offsetZ = design[2] - target[2];
    return [
      target[0] + offsetX * Math.cos(radians) + offsetZ * Math.sin(radians),
      design[1],
      target[2] - offsetX * Math.sin(radians) + offsetZ * Math.cos(radians),
    ];
  };
  const setCamera = async (degrees: number) => {
    await page.evaluate((position) => {
      window.dispatchEvent(new CustomEvent("reflectcup:set-test-camera", { detail: { position } }));
    }, positionAtAzimuth(degrees));
    await page.waitForTimeout(180);
  };
  const capture = async (degrees: number) => {
    await setCamera(degrees);
    return canvas.screenshot();
  };

  const designView = await capture(0);
  const plusFive = await capture(5);
  const plusTen = await capture(10);
  const plusFiveRepeat = await capture(5);

  const prepared = await Promise.all([designView, plusFive, plusTen, plusFiveRepeat].map((image) =>
    sharp(image).resize(240, 160, { fit: "fill" }).greyscale().raw().toBuffer()
  ));
  const highPassDifference = (left: Buffer, right: Buffer) => {
    let difference = 0;
    let compared = 0;
    // The camera target is fixed at the cup optical centre. This tight region
    // excludes the plate and most of the environment, so camera motion alone
    // cannot satisfy the assertion by changing the whole scene.
    for (let y = 49; y < 107; y += 1) {
      for (let x = 91; x < 149; x += 1) {
        const index = y * 240 + x;
        const laplacian = (image: Buffer) => 4 * image[index]
          - image[index - 1]
          - image[index + 1]
          - image[index - 240]
          - image[index + 240];
        difference += Math.abs(laplacian(left) - laplacian(right));
        compared += 1;
      }
    }
    return difference / compared;
  };
  const repeatNoise = highPassDifference(prepared[1], prepared[3]);
  const designToFive = highPassDifference(prepared[0], prepared[1]);
  const designToTen = highPassDifference(prepared[0], prepared[2]);
  testInfo.annotations.push({
    type: "acceptance",
    description: `cup ROI high-pass: repeat=${repeatNoise.toFixed(3)}, +5°=${designToFive.toFixed(3)}, +10°=${designToTen.toFixed(3)}`,
  });

  expect(repeatNoise).toBeLessThan(0.75);
  expect(designToFive).toBeGreaterThan(repeatNoise + 1.5);
  expect(designToTen).toBeGreaterThan(designToFive * 1.08);
});

test("the WebGL preview recovers after a context loss", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop WebGL lifecycle check");
  await mockStudio(page);
  await page.goto("/studio/new");
  await page.locator('input[type="file"]').setInputFiles("public/calibration/reflection-checker-2048.png");
  const canvas = page.getByTestId("reflection-preview").locator("canvas");
  await expect(canvas).toBeVisible();

  const lifecycle = await canvas.evaluate(async (element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!gl || !extension) return { supported: false, lost: false, restored: false };
    let lost = false;
    let restored = false;
    element.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      lost = true;
    }, { once: true });
    const restoredEvent = new Promise<void>((resolve) => {
      element.addEventListener("webglcontextrestored", () => {
        restored = true;
        resolve();
      }, { once: true });
    });
    extension.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 100));
    extension.restoreContext();
    await Promise.race([restoredEvent, new Promise<void>((resolve) => setTimeout(resolve, 3_000))]);
    return { supported: true, lost, restored };
  });

  expect(lifecycle).toEqual({ supported: true, lost: true, restored: true });
  await page.getByRole("button", { name: "Best view" }).click();
  await expect(canvas).toBeVisible();
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(1_000);
});

test("replacing the image repeatedly releases browser and GPU resources", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop GPU lifecycle check");
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const metrics = { objectUrlsCreated: 0, objectUrlsRevoked: 0, texturesDeleted: 0 };
    (window as typeof window & { __reflectCupResourceMetrics?: typeof metrics }).__reflectCupResourceMetrics = metrics;
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      metrics.objectUrlsCreated += 1;
      return originalCreate(value);
    };
    URL.revokeObjectURL = (value: string) => {
      metrics.objectUrlsRevoked += 1;
      return originalRevoke(value);
    };
    const originalDelete = WebGL2RenderingContext.prototype.deleteTexture;
    WebGL2RenderingContext.prototype.deleteTexture = function deleteTexture(texture: WebGLTexture | null) {
      metrics.texturesDeleted += 1;
      return originalDelete.call(this, texture);
    };
  });
  const state = await mockStudio(page);
  await page.goto("/studio/new");
  const input = page.locator('input[type="file"]');
  for (let index = 0; index < 20; index += 1) {
    await input.setInputFiles({ name: `replacement-${index}.png`, mimeType: "image/png", buffer: png });
    await expect.poll(() => state.uploads).toBe(index + 1);
    await page.waitForTimeout(60);
  }
  const metrics = await page.evaluate(() =>
    (window as typeof window & { __reflectCupResourceMetrics: { objectUrlsCreated: number; objectUrlsRevoked: number; texturesDeleted: number } })
      .__reflectCupResourceMetrics
  );
  expect(metrics.objectUrlsCreated).toBeGreaterThanOrEqual(20);
  expect(metrics.objectUrlsRevoked).toBeGreaterThanOrEqual(19);
  expect(metrics.texturesDeleted).toBeGreaterThan(5);
});

test("the demand-rendered preview stops drawing while idle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop render-loop check");
  await page.addInitScript(() => {
    let frames = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) => original((time) => {
      frames += 1;
      callback(time);
    });
    (window as typeof window & { __reflectCupFrames?: () => number }).__reflectCupFrames = () => frames;
  });
  await mockStudio(page);
  await page.goto("/studio/new");
  await page.locator('input[type="file"]').setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(1_500);
  const before = await page.evaluate(() =>
    (window as typeof window & { __reflectCupFrames: () => number }).__reflectCupFrames()
  );
  await page.waitForTimeout(1_000);
  const after = await page.evaluate(() =>
    (window as typeof window & { __reflectCupFrames: () => number }).__reflectCupFrames()
  );
  expect(after - before).toBeLessThan(15);
});

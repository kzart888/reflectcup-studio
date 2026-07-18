import { expect, test, type Page } from "@playwright/test";

const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  role: "owner",
  mustChangePassword: false,
};

async function mockDashboard(page: Page) {
  await page.route("**/api/v1/admin/preview-sessions", (route) => route.fulfill({ json: { data: { sessions: [] } } }));
  await page.route("**/api/v1/admin/optical-profiles", (route) => route.fulfill({ json: { data: { profiles: [] } } }));
  await page.route("**/api/v1/admin/production-artifacts", (route) => route.fulfill({ json: { data: { artifacts: [] } } }));
}

test("管理员可登录并进入真实数据概览", async ({ page }) => {
  await mockDashboard(page);
  await page.route("**/api/v1/admin/me", (route) => route.fulfill({ status: 401, json: { error: { code: "ADMIN_AUTH_REQUIRED", message: "Authentication required" } } }));
  await page.route("**/api/v1/admin/auth/login", (route) => route.fulfill({ json: { data: { user: owner } } }));

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.getByLabel("邮箱").fill(owner.email);
  await page.getByLabel("密码").fill("example-password");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("heading", { name: "运营概览" })).toBeVisible();
  await expect(page.getByText("数字光学原型", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "管理员", exact: true })).toBeVisible();
});

test("初次登录必须修改密码后才能查看后台", async ({ page }) => {
  await mockDashboard(page);
  await page.route("**/api/v1/admin/me", (route) => route.fulfill({ json: { data: { user: { ...owner, mustChangePassword: true } } } }));
  await page.route("**/api/v1/admin/me/password", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    await route.fulfill({ json: { data: { changed: true } } });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "请先更换初始密码" })).toBeVisible();
  await page.getByLabel("当前密码").fill("temporary-password");
  await page.getByLabel("新密码", { exact: true }).fill("a-new-secure-password");
  await page.getByLabel("再次输入新密码", { exact: true }).fill("a-new-secure-password");
  await page.getByRole("button", { name: "更新密码并进入后台" }).click();

  await expect(page.getByRole("heading", { name: "运营概览" })).toBeVisible();
});

test("只读成员看不到所有者或操作员控制", async ({ page }) => {
  const viewer = { ...owner, id: "22222222-2222-4222-8222-222222222222", email: "viewer@example.com", role: "viewer" };
  await page.route("**/api/v1/admin/me", (route) => route.fulfill({ json: { data: { user: viewer } } }));
  await page.route("**/api/v1/admin/optical-profiles", (route) => route.fulfill({ json: { data: { profiles: [{ id: "33333333-3333-4333-8333-333333333333", slug: "demo", label: "名义杯型", version: 1, status: "draft", checksum: "a".repeat(64), lutAssetId: null, maskAssetId: null, profile: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] } } }));

  await page.goto("/admin/profiles");
  await expect(page.getByRole("heading", { name: "光学模型" })).toBeVisible();
  await expect(page.getByRole("link", { name: "管理员", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "发布" })).toHaveCount(0);
});

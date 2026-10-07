import { expect, test, type Page } from "@playwright/test";
import { installBrowserSession, loginApi } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

const targetId = "22222222-2222-4222-8222-222222222222";
const audit = {
  auditId: "audit-target-1",
  userId: "11111111-1111-4111-8111-111111111111",
  actorEmail: "admin@example.com",
  action: "CHANGE_USER_ROLE",
  targetEntity: "UserAccount",
  targetId,
  targetFullName: "Nguyễn Người Bị Tác Động",
  targetEmail: "target@example.com",
  targetAccountExists: true,
  timestamp: "2026-10-06T09:00:00Z",
  oldValue: null,
  newValue: null,
};

async function setup(page: Page, rows: object[]) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId: audit.userId,
          email: audit.actorEmail,
          fullName: "Admin thực hiện",
          role: "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (url.pathname === "/api/audit-logs")
      return route.fulfill({
        json: { items: rows, totalCount: rows.length, page: 1, pageSize: 25 },
      });
    if (url.pathname === "/api/users/admin")
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 1 },
      });
    if (
      url.pathname === "/api/sports" ||
      url.pathname.includes("notifications")
    )
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: "fixture_missing", message: url.pathname },
    });
  });
}

test("audit and overview distinguish target identity from actor without row detail requests", async ({
  page,
}) => {
  await setup(page, [audit]);
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  for (const path of ["/admin/audit-log", "/admin"]) {
    await page.goto(path);
    const table = page.getByRole("table");
    await expect(
      table.getByRole("columnheader", {
        name: "Affected account",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      table.getByRole("link", { name: audit.targetFullName, exact: true }),
    ).toHaveAttribute("href", `/admin/users/${targetId}`);
    await expect(table).toContainText(audit.targetEmail);
    await expect(table).toContainText(audit.actorEmail);
    await expect(table).not.toContainText(targetId);
    await expect(table).not.toContainText("UserAccount");
  }
  expect(
    requests.some((path) => path === `/api/users/${targetId}`),
  ).toBeFalsy();
});

test("missing account and older API responses retain IDs without falsely claiming deletion", async ({
  page,
}) => {
  const missingId = "33333333-3333-4333-8333-333333333333";
  const legacyId = "44444444-4444-4444-8444-444444444444";
  await setup(page, [
    {
      ...audit,
      auditId: "missing",
      targetId: missingId,
      targetFullName: null,
      targetEmail: null,
      targetAccountExists: false,
    },
    {
      ...audit,
      auditId: "legacy",
      targetId: legacyId,
      targetFullName: undefined,
      targetEmail: undefined,
      targetAccountExists: undefined,
    },
    { ...audit, auditId: "no-name", targetFullName: null },
  ]);
  await page.goto("/admin/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("Account no longer exists");
  await expect(table).toContainText("Account information unavailable");
  await expect(table).toContainText(missingId);
  await expect(table).toContainText(legacyId);
  await expect(
    table.getByRole("link", { name: audit.targetEmail, exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("link", { name: "Account no longer exists" }),
  ).toHaveCount(0);
});

test("long target identity fits Vietnamese desktop and mobile", async ({
  page,
}) => {
  await setup(page, [
    {
      ...audit,
      targetFullName: "Nguyễn Văn Tài Khoản Được Quản Trị Có Tên Dài",
      targetEmail: "very-long-target-account-email-for-layout@example.com",
    },
  ]);
  await page.addInitScript(() => localStorage.setItem("sporthub_lang", "vi"));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/audit-log");
    await expect(page.getByRole("table")).toContainText(
      "Tài khoản bị tác động",
    );
    await expect(
      page.getByRole("link", { name: /Nguyễn Văn Tài Khoản/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 390)
      await page.screenshot({
        path: "../output/admin-audit-target-mobile.png",
        fullPage: true,
      });
  }
});

test("live audit API matches target account identity and UI while G10 remains blocked", async ({
  page,
  request,
}) => {
  test.skip(!liveApiBase, "Requires Docker API and demo Admin account.");
  const { accessToken } = await loginApi(request, "admin@sporthub.vn");
  const headers = bearer(accessToken);
  const response = await request.get(
    `${liveApiBase}/api/audit-logs?pageSize=25`,
    { headers },
  );
  expect(response.ok()).toBeTruthy();
  const rows = (await response.json()).items as (typeof audit)[];
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (row) =>
        row.targetEntity === "UserAccount" &&
        typeof row.targetAccountExists === "boolean",
    ),
  ).toBeTruthy();
  const target = rows.find((row) => row.targetAccountExists && row.targetEmail);
  expect(target).toBeDefined();
  const accountResponse = await request.get(
    `${liveApiBase}/api/users/admin?keyword=${encodeURIComponent(target!.targetEmail)}`,
    { headers },
  );
  const account = (await accountResponse.json()).items.find(
    (row: { userId: string }) => row.userId === target!.targetId,
  );
  expect(account.fullName).toBe(target!.targetFullName);
  expect(account.email).toBe(target!.targetEmail);
  expect(
    (
      await request.get(`${liveApiBase}/api/users/${target!.targetId}`, {
        headers,
      })
    ).status(),
  ).toBe(403);
  await installBrowserSession(page, accessToken);
  await page.goto("/admin/audit-log");
  const table = page.getByRole("table");
  await expect(
    table
      .getByRole("link", { name: target!.targetFullName, exact: true })
      .first(),
  ).toBeVisible();
  await expect(table).toContainText(target!.targetEmail);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.screenshot({
    path: "../output/admin-audit-target-live.png",
    fullPage: true,
  });
});

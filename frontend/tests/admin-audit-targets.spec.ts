import { assertEnglishOnlyShell } from "./helpers/english";
import { expect, test, type Page } from "@playwright/test";
import { installBrowserSession, loginApi } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

const targetId = "22222222-2222-4222-8222-222222222222";
const audit = {
  auditId: "audit-target-1",
  userId: "11111111-1111-4111-8111-111111111111",
  actorEmail: "admin@example.com",
  actorFullName: "Admin Nguyen",
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

test("account audit displays recorded reasons and changes without exposing unknown metadata", async ({
  page,
}) => {
  await setup(page, [
    {
      ...audit,
      oldValue: JSON.stringify({ role: "Receptionist" }),
      newValue: JSON.stringify({
        value: { role: "CenterManager", password: "MUST_NOT_RENDER" },
        reason: "Promotion approved by leader",
      }),
    },
  ]);
  await page.goto("/admin/audit-log");
  const table = page.getByRole("table");
  await table.getByRole("button", { name: /View details:/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Promotion approved by leader",
  );
  await expect(page.getByRole("dialog").getByRole("table")).toContainText(
    "Receptionist",
  );
  await page.keyboard.press("Escape");
  await expect(table).not.toContainText("MUST_NOT_RENDER");
  await assertEnglishOnlyShell(page);
});

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
        name: "Target",
        exact: true,
      }),
    ).toBeVisible();
    if (path === "/admin") {
      await expect(
        table.getByRole("link", { name: audit.targetFullName, exact: true }),
      ).toHaveAttribute("href", `/admin/users/${targetId}`);
      await expect(table).toContainText(audit.targetEmail);
    } else {
      await expect(table.locator('[data-label="Target"]')).toHaveText(
        "Account",
      );
      await table.getByRole("button", { name: /View details:/ }).click();
      await expect(page.getByRole("dialog")).toContainText(audit.targetEmail);
      await page.keyboard.press("Escape");
    }
    await expect(table).toContainText(audit.actorEmail);
    if (path === "/admin/audit-log") {
      await expect(table).toContainText(audit.actorFullName);
      await expect(
        table.getByRole("columnheader", { name: "Actor", exact: true }),
      ).toBeVisible();
      await expect(table.locator("thead th").last()).toHaveText("");
    }
    await expect(table).not.toContainText(audit.userId);
    await expect(table).not.toContainText(targetId);
    await expect(table).not.toContainText("UserAccount");
  }
  expect(
    requests.some((path) => path === `/api/users/${targetId}`),
  ).toBeFalsy();
});

test("missing account and older API responses hide IDs without falsely claiming deletion", async ({
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
  const buttons = table.getByRole("button", { name: /View details:/ });
  await buttons.nth(0).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Account no longer exists",
  );
  await page.keyboard.press("Escape");
  await buttons.nth(1).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Account information unavailable",
  );
  await page.keyboard.press("Escape");
  await expect(table).not.toContainText(missingId);
  await expect(table).not.toContainText(legacyId);
  await buttons.nth(2).click();
  await expect(page.getByRole("dialog")).toContainText(audit.targetEmail);
  await page.keyboard.press("Escape");
  await expect(
    table.getByRole("link", { name: "Account no longer exists" }),
  ).toHaveCount(0);
});

test("all audit columns hide unresolved UUIDs and keep readable details", async ({
  page,
}) => {
  const unknown = "db3d195a-043e-4585-afd7-e2f256816950";
  await setup(page, [
    {
      ...audit,
      targetEntity: "Class",
      targetId: unknown,
      currentTargetLabel: "Basketball class",
      oldValue: JSON.stringify({
        coachId: unknown,
        reason: `Reassigned from ${unknown}`,
      }),
      newValue: JSON.stringify({
        coachId: "29224869-bfb5-491b-91d3-c48076006c6e",
        reason: "Staff update",
      }),
    },
  ]);
  await page.goto("/admin/audit-log");
  const table = page.getByRole("table");
  await table.getByRole("button", { name: /View details:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Staff update");
  await expect(page.getByRole("dialog")).toContainText("Basketball class");
  await expect(page.getByRole("dialog")).toContainText("Unavailable");
  await page.keyboard.press("Escape");
  await expect(table).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
});

test("long Vietnamese target names fit the English shell on desktop and mobile", async ({
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
    await expect(page.getByRole("table")).toContainText("Target");
    await page
      .getByRole("table")
      .getByRole("button", { name: /View details:/ })
      .click();
    await expect(
      page.getByRole("dialog").getByText(/Nguyễn Văn Tài Khoản/),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    if (width === 390)
      await page.screenshot({
        path: "../output/admin-audit-target-mobile.png",
        fullPage: true,
      });
  }
});

test("live audit matches target identity and preserves separate Admin and staff detail permissions", async ({
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
        row.targetEntity !== "UserAccount" ||
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
  await assertEnglishOnlyShell(page);
  await page.screenshot({
    path: "../output/admin-audit-target-live.png",
    fullPage: true,
  });
});

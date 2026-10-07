import { expect, test, type Page } from "@playwright/test";
import { loginApi, installBrowserSession } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

const base = {
  auditId: "audit-price",
  userId: "11111111-1111-4111-8111-111111111111",
  actorEmail: "manager@example.com",
  action: "UPDATE_MEMBERSHIP_PACKAGE",
  targetEntity: "MembershipPackage",
  targetId: "6",
  timestamp: "2026-10-06T16:13:00Z",
};
const before = {
  name: "Test price",
  price: 100000,
  durationDays: 30,
  sessionLimit: null,
  isActive: true,
};
const priceChange = {
  ...base,
  oldValue: JSON.stringify({ ...before, otp: "SECRET_OTP" }),
  newValue: JSON.stringify({
    ...before,
    price: 200000,
    emailBody: "SECRET_BODY",
  }),
};

async function setup(page: Page, rows: object[], language = "en") {
  const requests: string[] = [];
  await page.addInitScript((lang) => {
    localStorage.setItem("sporthub.accessToken", "fixture");
    localStorage.setItem("sporthub_lang", lang);
  }, language);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: base.userId,
          email: base.actorEmail,
          fullName: "Manager",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/audit-logs")
      return route.fulfill({
        json: { items: rows, totalCount: rows.length, page: 1, pageSize: 25 },
      });
    if (path === "/api/sports" || path.includes("notifications"))
      return route.fulfill({ json: [] });
    // Current price deliberately differs from the historical event.
    if (path === "/api/membership-packages")
      return route.fulfill({
        json: [{ packageId: 6, name: "Renamed today", price: 900000 }],
      });
    return route.fulfill({ status: 404, json: { error: "fixture_missing" } });
  });
  return requests;
}

test("membership price log shows historical before/after and hides unchanged status and secrets", async ({
  page,
}) => {
  const requests = await setup(page, [priceChange], "vi");
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("Gói: Test price");
  await expect(table).toContainText("Giá:");
  await expect(table).toContainText("100,000 ₫");
  await expect(table).toContainText("200,000 ₫");
  await expect(table.locator("del")).toHaveText("100,000 ₫");
  await expect(table).not.toContainText("isActive");
  await expect(table).not.toContainText("Trạng thái:");
  await expect(table).not.toContainText("Thời hạn:");
  await expect(table).not.toContainText("900,000");
  await expect(page.getByText(/SECRET_OTP|SECRET_BODY/)).toHaveCount(0);
  expect(requests).not.toContain("/api/membership-packages");
});

test("creation displays package details and multi-field updates show only changes", async ({
  page,
}) => {
  await setup(page, [
    {
      ...base,
      auditId: "create",
      action: "CREATE_MEMBERSHIP_PACKAGE",
      oldValue: null,
      newValue: JSON.stringify(before),
    },
    {
      ...base,
      auditId: "multiple",
      oldValue: JSON.stringify(before),
      newValue: JSON.stringify({
        ...before,
        name: "New package name",
        price: 300000,
        durationDays: 60,
      }),
    },
  ]);
  await page.goto("/manager/audit-log");
  const created = page
    .getByRole("row")
    .filter({ hasText: "CREATE_MEMBERSHIP_PACKAGE" });
  await expect(created).toContainText("Package: Test price");
  await expect(created).toContainText("Price: 100,000 ₫");
  await expect(created).toContainText("Duration: 30 days");
  await expect(created).toContainText("Status: Active");
  await expect(created).not.toContainText("Session limit");
  const updated = page
    .getByRole("row")
    .filter({ hasText: "UPDATE_MEMBERSHIP_PACKAGE" });
  await expect(updated).toContainText("Package name:");
  await expect(updated).toContainText("New package name");
  await expect(updated).toContainText("60 days");
  await expect(updated).toContainText("300,000 ₫");
  await expect(updated).not.toContainText("Status:");
  await expect(updated.locator("del")).toHaveText([
    "Test price",
    "100,000 ₫",
    "30 days",
  ]);
});

test("deactivation displays status change without an unchanged price", async ({
  page,
}) => {
  await setup(
    page,
    [
      {
        ...base,
        action: "DISCONTINUE_MEMBERSHIP_PACKAGE",
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify({ ...before, isActive: false }),
      },
    ],
    "vi",
  );
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("Trạng thái:");
  await expect(table).toContainText("Đang hiệu lực");
  await expect(table).toContainText("Ngừng hoạt động");
  await expect(table).not.toContainText("Giá:");
  await expect(table).not.toContainText("true");
  await expect(table).not.toContainText("false");
});

test("missing/malformed/unchanged metadata stays truthful without raw JSON or invented prices", async ({
  page,
}) => {
  await setup(page, [
    {
      ...base,
      auditId: "invalid",
      targetId: "101",
      oldValue: "{broken",
      newValue: JSON.stringify({
        price: { secret: "SECRET_OBJECT" },
        password: "SECRET_PASSWORD",
      }),
    },
    {
      ...base,
      auditId: "same",
      targetId: "102",
      oldValue: JSON.stringify(before),
      newValue: JSON.stringify(before),
    },
    {
      ...base,
      auditId: "partial",
      targetId: "103",
      oldValue: JSON.stringify({ name: "Partial", isActive: true }),
      newValue: JSON.stringify({
        name: "Partial",
        isActive: true,
        price: 200000,
      }),
    },
    {
      ...base,
      auditId: "wrapped",
      targetId: "104",
      oldValue: JSON.stringify({ value: before }),
      newValue: JSON.stringify({ value: { ...before, price: 250000 } }),
    },
  ]);
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("No operation details were recorded.");
  await expect(table).toContainText("No changes in the recorded fields.");
  const partial = page.getByRole("row").filter({ hasText: "Package: Partial" });
  await expect(partial).toContainText("Not recorded");
  await expect(partial).toContainText("200,000 ₫");
  await expect(partial.locator("del")).toHaveText("Not recorded");
  await expect(table).toContainText("250,000 ₫");
  await expect(
    page.getByText(/SECRET_OBJECT|SECRET_PASSWORD|broken/),
  ).toHaveCount(0);
});

test("membership metadata fits desktop/mobile and changes language", async ({
  page,
}) => {
  await setup(page, [
    {
      ...priceChange,
      oldValue: JSON.stringify({
        ...before,
        name: "Long package name ".repeat(7),
      }),
      newValue: JSON.stringify({
        ...before,
        name: "Long package name ".repeat(7),
        price: 200000,
      }),
    },
  ]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/manager/audit-log");
    await expect(page.getByRole("table")).toContainText("200,000 ₫");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "../output/manager-membership-audit-mobile.png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Giá:");
});

test("live historical membership update renders the recorded price change after reload", async ({
  page,
  request,
}) => {
  const apiBase = liveApiBase;
  test.skip(!apiBase, "Set P2_LIVE_API for read-only live verification");
  const login = await loginApi(request, "manager@sporthub.vn");
  const response = await request.get(
    apiBase +
      "/api/audit-logs?targetEntity=MembershipPackage&action=UPDATE_MEMBERSHIP_PACKAGE&page=1&pageSize=25&sortBy=timestamp&sortDirection=desc",
    { headers: bearer(login.accessToken) },
  );
  expect(response.ok()).toBe(true);
  const logs = await response.json();
  const sample = logs.items.find(
    (entry: { oldValue: string | null; newValue: string | null }) => {
      try {
        const old = JSON.parse(entry.oldValue ?? "{}");
        const next = JSON.parse(entry.newValue ?? "{}");
        return (
          typeof old.price === "number" &&
          typeof next.price === "number" &&
          old.price !== next.price
        );
      } catch {
        return false;
      }
    },
  );
  expect(sample, "Expected an existing price-change audit event").toBeTruthy();
  const old = JSON.parse(sample.oldValue);
  const next = JSON.parse(sample.newValue);
  const money = (value: number) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value) +
    " ₫";
  await installBrowserSession(page, login.accessToken);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    else
      await page.goto(
        "/manager/audit-log?targetEntity=MembershipPackage&action=UPDATE_MEMBERSHIP_PACKAGE",
      );
    const table = page.getByRole("table");
    await expect(table).toContainText(money(old.price));
    await expect(table).toContainText(money(next.price));
    await expect(table).not.toContainText("isActive");
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.screenshot({
    path: "../output/manager-membership-audit-live.png",
    fullPage: true,
  });
});

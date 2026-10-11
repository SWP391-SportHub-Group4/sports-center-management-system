import { expect, test, type Page } from "@playwright/test";

const managerId = "11111111-1111-4111-8111-111111111111";
const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length });

async function managerFixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({ json: { userId: managerId, fullName: "Manager", email: "manager@example.com", role: "CENTER_MANAGER", sportIds: [] } });
    if (path.includes("notifications")) return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    if (path === "/api/reports/revenue")
      return route.fulfill({ json: { fromDate: "2030-10-01", toDate: "2030-10-31", totalCollected: 100000, totalRefunded: 0, totalObligationReduction: 0, netRevenue: 100000, invoiceCount: 1, paymentCount: 1, refundCount: 0, legacyCashCollected: 0, reconciliationCashCollected: 0, reconciliationCashCount: 0, pointsRedeemed: 200, pointsRedeemedVnd: 200000, pointsIssued: 25, managerPointAdjustment: 5, outstandingPoints: 525, bySource: [], bySportAndSource: [], daily: [] } });
    if (path === "/api/reports/revenue-dimensions")
      return route.fulfill({ json: { fromDate: "2030-10-01", toDate: "2030-10-31", cashCollected: 100000, pointsRedeemedVnd: 200000, rows: [] } });
    if (path === "/api/reports/membership-period")
      return route.fulfill({ json: { fromDate: "2030-10-01", toDate: "2030-10-31", newMembers: 2, activeMembersAtPeriodEnd: 7 } });
    if (path === "/api/reports/class-enrollment")
      return route.fulfill({ json: { fromDate: "2030-10-01", toDate: "2030-10-31", totalClasses: 1, totalCapacity: 10, totalConfirmed: 4, totalActiveHolds: 1, fillRatio: 0.4, classes: [] } });
    if (path === "/api/reports/exports") return route.fulfill({ json: paged([]) });
    if (path === "/api/sports" || path === "/api/manager/sports") return route.fulfill({ json: [{ sportId: 3, name: "Badminton", code: "course", services: [{ serviceType: "GROUP_COURSE", isEnabled: true, defaultSessionMinutes: 90, defaultMaxCapacity: 12 }], isActive: true }] });
    if (path === "/api/refunds") return route.fulfill({ json: paged([]) });
    if (path === "/api/users") return route.fulfill({ json: paged([]) });
    if (path === "/api/audit-logs") return route.fulfill({ json: paged([]) });
    return route.fulfill({ status: 404, json: { code: "fixture_missing", message: path } });
  });
}

test.beforeEach(async ({ page }) => managerFixture(page));

test("manager overview uses server cash/points metrics and no profit claim", async ({ page }) => {
  await page.goto("/manager");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("100,000", { exact: false })).toBeVisible();
  await expect(page.getByText("200,000", { exact: false })).toBeVisible();
  await expect(page.getByText(/profit/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
});

test("manager reports keep VND and point units distinct", async ({ page }) => {
  await page.goto("/manager/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await expect(page.getByText("Cash collected (VND)", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Points issued", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Outstanding points (available + held)", { exact: true }).first()).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`manager P2.12 pages fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/manager", "/manager/reports", "/manager/payment-adjustments", "/manager/audit-log"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  });
}

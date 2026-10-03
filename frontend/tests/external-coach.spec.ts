import { expect, test, type Page } from "@playwright/test";

const externalId = "22222222-2222-4222-8222-222222222222";

async function externalFixture(page: Page, approvalStatus: "PENDING_APPROVAL" | "APPROVED") {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "external-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me") return route.fulfill({ json: { userId: externalId, fullName: "External Coach", email: "external@example.com", role: "EXTERNAL_COACH", sportIds: [3], approvalStatus } });
    if (path.includes("notifications")) return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    if (path === "/api/sports") return route.fulfill({ json: [{ sportId: 3, name: "Badminton", operationType: "GROUP_COURSE", isActive: true }] });
    if (path === "/api/external-coaches/me") return route.fulfill({ json: { userId: externalId, email: "external@example.com", fullName: "External Coach", phone: null, bio: "Coach", approvalStatus, sportIds: [3], reviewedByUserId: null, reviewedAt: null, reviewNote: null, createdAt: "2030-10-01T00:00:00Z" } });
    if (path === "/api/wallet/me") return route.fulfill({ json: { ownerUserId: externalId, availablePoints: 50, heldPoints: 0, vndPerPoint: 1000 } });
    if (path === "/api/wallet/me/ledger") return route.fulfill({ json: { items: [], page: 1, pageSize: 20, totalCount: 0 } });
    if (path === "/api/court-rentals/mine") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { code: "fixture_missing", message: path } });
  });
}

test("pending external coach cannot start court booking from dashboard", async ({ page }) => {
  await externalFixture(page, "PENDING_APPROVAL");
  await page.goto("/external-coach");
  await expect(page.getByRole("link", { name: "Book a court", exact: true })).toHaveCount(0);
  await expect(page.getByText(/approval/i).first()).toBeVisible();
});

test("approved external coach receives booking entry point", async ({ page }) => {
  await externalFixture(page, "APPROVED");
  await page.goto("/external-coach");
  await expect(page.getByRole("link", { name: "Book a court", exact: true })).toBeVisible();
});

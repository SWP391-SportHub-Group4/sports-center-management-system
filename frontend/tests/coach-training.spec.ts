import { expect, test, type Page } from "@playwright/test";

const coachId = "33333333-3333-4333-8333-333333333333";
async function coachFixture(page: Page, sportIds: number[]) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "coach-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me") return route.fulfill({ json: { userId: coachId, fullName: "Coach", email: "coach@example.com", role: "COACH", sportIds, isPersonalTrainer: sportIds.includes(2) } });
    if (path === "/api/sports") return route.fulfill({ json: [{ sportId: 2, name: "PT", code: "gym", services: [{ serviceType: "PERSONAL_TRAINING", isEnabled: true, defaultSessionMinutes: null, defaultMaxCapacity: null }], isActive: true }, { sportId: 3, name: "Badminton", code: "course", services: [{ serviceType: "GROUP_COURSE", isEnabled: true, defaultSessionMinutes: 90, defaultMaxCapacity: 12 }], isActive: true }] });
    if (path.includes("notifications")) return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    if (path === "/api/coaches/me/classes") return route.fulfill({ json: [] });
    if (path === "/api/coach-member-relationships") return route.fulfill({ json: [] });
    if (path.endsWith("/pt-entitlements") || path.includes("/pt-sessions")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { code: "fixture_missing", message: path } });
  });
}

test("coach with PT and group specialties can navigate both workspaces", async ({ page }) => {
  await coachFixture(page, [2, 3]);
  await page.goto("/coach");
  // PT nằm trong nhóm "Training" của thanh điều hướng trên cùng.
  await page.getByRole("button", { name: "Training", exact: true }).click();
  await expect(page.getByRole("link", { name: "PT schedule", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Attendance", exact: true })).toBeVisible();
});

test("group-only coach does not receive PT action navigation", async ({ page }) => {
  await coachFixture(page, [3]);
  await page.goto("/coach");
  await expect(page.getByRole("link", { name: "PT schedule", exact: true })).toHaveCount(0);
});

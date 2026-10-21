import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/locales/en";

async function setup(page: Page) {
  let account = {
    userId: "11111111-1111-4111-8111-111111111111",
    fullName: "Alex Nguyen",
    email: "alex@example.com",
    role: "CENTER_MANAGER",
    status: "ACTIVE",
    phone: "0901234567",
    createdAt: "2026-01-01T00:00:00Z",
    hasPassword: true,
    sportIds: [],
    avatarUrl: null,
  };
  const writes: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/users/me/profile") {
      const body = request.postDataJSON();
      writes.push(body);
      account = { ...account, ...body };
      return route.fulfill({ json: account });
    }
    if (path === "/api/users/me") return route.fulfill({ json: account });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    if (path === "/api/reports/revenue")
      return route.fulfill({
        json: {
          totalCollected: 500000,
          totalRefunded: 0,
          netRevenue: 500000,
          paymentCount: 2,
          reconciliationCashCollected: 0,
          pointsRedeemed: 20,
          pointsRefunded: 0,
          outstandingPoints: 40,
          byDay: [],
          bySource: [],
          bySportAndSource: [],
        },
      });
    if (path === "/api/reports/membership-period")
      return route.fulfill({
        json: { newMembers: 3, activeMembersAtPeriodEnd: 8 },
      });
    if (path === "/api/reports/class-enrollment")
      return route.fulfill({
        json: {
          classes: [],
          totalCapacity: 0,
          totalConfirmed: 0,
          totalActiveHolds: 0,
        },
      });
    if (path === "/api/invoices")
      return route.fulfill({
        json: {
          items: ["PAID", "VOID"].map((status, index) => ({
            invoiceId: `00000000-0000-4000-8000-00000000000${index}`,
            invoiceNumber: `${status}-ORDER`,
            memberName: "Member",
            memberEmail: "member@example.com",
            status,
            issuedAt: "2026-10-01T00:00:00Z",
            totalAmount: 100000,
            paidAmount: 100000,
            grossCollected: 100000,
            outstanding: 0,
            refundedAmount: 0,
            pointsSpent: 0,
            cashAmount: 100000,
          })),
          totalCount: 2,
          page: 1,
          pageSize: 10,
        },
      });
    return route.fulfill({ json: [] });
  });
  return writes;
}

test("personal settings preserve editing and separate security with keyboard tabs", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Alex Nguyen", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(en.account.fullName, { exact: true })
    .fill("Alex SportHub");
  await page
    .getByRole("tab", { name: en.account.profileTitle, exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Security", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel(en.account.currentPassword, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.impeccable/review/operations-security-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByLabel(en.account.fullName, { exact: true }),
  ).toHaveValue("Alex SportHub");
  await page
    .getByRole("button", { name: en.account.saveProfile, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alex SportHub", exact: true }),
  ).toBeVisible();
  expect(writes).toContainEqual({
    fullName: "Alex SportHub",
    phone: "0901234567",
  });
  await page.screenshot({
    path: "../.impeccable/review/operations-profile-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/operations-profile-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Security", exact: true }).click();
  await page.screenshot({
    path: "../.impeccable/review/operations-security-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("manager navigation uses the requested order and invoices omit Void", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/manager/finance");
  const nav = page.locator("header nav").first();
  await expect(nav.getByRole("link")).toHaveText([
    "Overview",
    "Sport",
    "Media",
    "People",
  ]);
  await expect(nav.getByRole("button")).toHaveText(["Services", "Exception"]);
  await nav.getByRole("button", { name: "Services", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Invoices", exact: true }),
  ).toHaveAttribute("href", "/manager/finance");
  await nav.getByRole("button", { name: "Services", exact: true }).click();
  await expect(page.getByText("PAID-ORDER", { exact: true })).toBeVisible();
  await expect(page.getByText("VOID-ORDER", { exact: true })).toHaveCount(0);
  await page.locator("details > summary").click();
  await expect(
    page.getByRole("option", { name: "Void", exact: true }),
  ).toHaveCount(0);
});

test("overview omits collected and the schedule chooses dates instead of numbered weeks", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/manager");
  await expect(
    page.getByText("Net revenue (VND)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/collected/i)).toHaveCount(0);
  await page.screenshot({
    path: "../.impeccable/review/operations-overview-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/operations-overview-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.goto("/manager/schedule?date=2030-10-03&view=week");
  await expect(page.locator('input[type="week"]')).toHaveCount(0);
  const date = page.locator('input[type="date"]').first();
  await expect(date).toHaveValue("2030-10-03");
  await date.fill("2030-10-10");
  await expect(page).toHaveURL(/date=2030-10-07/);
});

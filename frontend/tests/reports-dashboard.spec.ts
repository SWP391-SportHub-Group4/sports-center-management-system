import { test, expect, type Page } from "@playwright/test";
import {
  monthPeriod,
  reportPeriods,
  changeLabel,
  validPeriod,
  type PeriodSelection,
} from "../src/features/reports/report-periods";

const today = "2026-10-23";
const memberId = "22222222-2222-4222-8222-222222222222";
const selection = (date = today): PeriodSelection => ({
  ...monthPeriod(date),
  compare: "previous",
  compareFrom: "2026-09-01",
  compareTo: "2026-09-30",
});
test("report periods handle leap years, elapsed days, custom lengths and zero baselines", () => {
  expect(monthPeriod("2024-02-12").toDate).toBe("2024-02-29");
  expect(monthPeriod("2025-02-12").toDate).toBe("2025-02-28");
  expect(reportPeriods(selection(), today, true).comparison?.toDate).toBe(
    "2026-09-23",
  );
  expect(reportPeriods(selection(), today, false).comparison?.toDate).toBe(
    "2026-09-30",
  );
  expect(
    reportPeriods(selection("2026-03-31"), "2026-03-31", true).comparison
      ?.toDate,
  ).toBe("2026-02-28");
  expect(
    reportPeriods(selection("2026-11-01"), today, true).primary,
  ).toBeNull();
  expect(changeLabel(100, 0, true, String)).toBe("+100");
  expect(changeLabel(100, 20, false, String)).toBe("+80");
  expect(validPeriod({ fromDate: "2024-01-01", toDate: "2024-12-31" })).toBe(
    true,
  );
  expect(validPeriod({ fromDate: "2024-01-01", toDate: "2025-01-01" })).toBe(
    false,
  );
});
async function fixture(page: Page, failComparison = false) {
  const requests: URL[] = [];
  await page.clock.setFixedTime(new Date("2026-10-23T03:00:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    requests.push(url);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        },
      });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    if (path === "/api/manager/sports")
      return route.fulfill({
        json: [
          { sportId: 3, name: "Badminton" },
          { sportId: 4, name: "Basketball" },
        ],
      });
    if (path === "/api/users")
      return route.fulfill({
        json: {
          items: [
            {
              userId: memberId,
              fullName: "Alex Member",
              email: "alex@example.test",
              role: "MEMBER",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 8,
        },
      });
    if (path.startsWith("/api/users/"))
      return route.fulfill({
        json: { userId: memberId, fullName: "Alex Member", role: "MEMBER" },
      });
    const fromDate = url.searchParams.get("fromDate") ?? "2026-10-01",
      toDate = url.searchParams.get("toDate") ?? today;
    if (failComparison && fromDate.startsWith("2026-09"))
      return route.fulfill({
        status: 500,
        json: { error: "failed", message: "Unavailable" },
      });
    const days = Array.from(
      {
        length: Math.max(
          1,
          Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) +
            1,
        ),
      },
      (_, i) =>
        new Date(Date.parse(fromDate) + i * 86400000)
          .toISOString()
          .slice(0, 10),
    );
    if (path === "/api/reports/revenue") {
      const filtered = url.searchParams.has("sportId"),
        value = filtered ? 100000 : 1200000;
      return route.fulfill({
        json: {
          fromDate,
          toDate,
          totalCollected: value * days.length,
          totalRefunded: 200000,
          netRevenue: value * days.length - 200000,
          pointsRedeemed: 200,
          pointsRefunded: 25,
          outstandingPoints: 525,
          bySource: [
            {
              source: "RENTAL",
              cashCollected: value * days.length,
              pointsRedeemed: 200,
            },
          ],
          bySportAndSource: [
            {
              source: "RENTAL",
              sportId: 3,
              sportName: "Badminton",
              memberId,
              cashCollected: value * days.length,
              pointsRedeemed: 200,
            },
          ],
          daily: days.map((date, i) => ({
            date,
            collected: value,
            refunded: i === 1 ? 200000 : 0,
            net: value - (i === 1 ? 200000 : 0),
          })),
        },
      });
    }
    if (path === "/api/reports/court-bookings")
      return route.fulfill({
        json: {
          fromDate,
          toDate,
          totalBookings: days.length * 2,
          totalBookedHours: days.length * 3,
          bySport: [
            {
              sportId: 3,
              sportName: "Badminton",
              bookings: days.length * 2,
              bookedHours: days.length * 3,
            },
          ],
          daily: days.map((date) => ({ date, bookings: 2, bookedHours: 3 })),
        },
      });
    if (path === "/api/reports/class-status")
      return route.fulfill({
        json: {
          open: 2,
          completed: 1,
          unpublished: 1,
          classes: [
            {
              classId: 1,
              name: "Badminton foundations",
              sportId: 3,
              sportName: "Badminton",
              status: "PUBLISHED",
              startDate: fromDate,
              confirmedCount: 8,
              capacity: 10,
              thresholdStatus: "MET",
            },
            {
              classId: 2,
              name: "Basketball skills",
              sportId: 4,
              sportName: "Basketball",
              status: "IN_PROGRESS",
              startDate: fromDate,
              confirmedCount: 14,
              capacity: 20,
              thresholdStatus: "MET",
            },
          ],
        },
      });
    if (path === "/api/reports/membership-summary")
      return route.fulfill({
        json: { asOfDate: today, membersWithActiveMembership: 125 },
      });
    if (path === "/api/reports/membership-period")
      return route.fulfill({
        json: {
          membersPurchasingMembershipInPeriod: 18,
          dayPassesSold: 5,
          daily: days.map((date) => ({ date, buyers: 2 })),
        },
      });
    return route.fulfill({ json: [] });
  });
  return requests;
}
test("Apply updates all report data and keeps filters scoped to each bookmark", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/manager/reports");
  await expect(
    page.getByRole("heading", { name: "After refunds", exact: true }),
  ).toBeVisible();
  await page.getByText("More filters", { exact: true }).click();
  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page.getByLabel("Source", { exact: true }).selectOption("RENTAL");
  await page.getByPlaceholder("Find a member").fill("Alex");
  await page.getByRole("button", { name: /Alex Member/ }).click();
  await expect(
    page.getByText("Changes not applied", { exact: true }),
  ).toBeVisible();
  expect(
    requests
      .filter((u) => u.pathname === "/api/reports/revenue")
      .at(-1)
      ?.searchParams.has("sportId"),
  ).toBe(false);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(() =>
      requests
        .filter((u) => u.pathname === "/api/reports/revenue")
        .at(-1)
        ?.searchParams.get("memberId"),
    )
    .toBe(memberId);
  await expect(
    page.getByRole("heading", { name: "After refunds by day" }),
  ).toBeVisible();
  await page.getByText("View details", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Money received (VND)" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Courts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Booked hours", exact: true }),
  ).toBeVisible();
  const court = requests
    .filter((u) => u.pathname === "/api/reports/court-bookings")
    .at(-1)!;
  expect(court.searchParams.get("toDate")).toBe("2026-10-31");
  expect(court.searchParams.has("memberId")).toBe(false);
  await page.getByRole("tab", { name: "Revenue", exact: true }).click();
  await page.getByText(/More filters/).click();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveValue("3");
});
test("comparison errors retain the primary data and current Gym count has no comparison", async ({
  page,
}) => {
  const requests = await fixture(page, true);
  await page.goto("/manager/reports");
  await page.getByLabel("Compare with").selectOption("previous");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Comparison: Unavailable")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "After refunds", exact: true }),
  ).toBeVisible();
  expect(
    requests.some((u) => u.searchParams.get("toDate") === "2026-09-23"),
  ).toBe(true);
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Active Gym members" }),
  ).toBeVisible();
  expect(
    requests
      .filter((u) => u.pathname === "/api/reports/membership-summary")
      .every((u) => u.searchParams.get("asOfDate") === today),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "New member accounts" }),
  ).toHaveCount(0);
});
test("export uses the selected comparison range and applied filters", async ({
  page,
}) => {
  await fixture(page);
  let body: Record<string, unknown> = {};
  await page.route("**/api/reports/exports", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      json: { reportExportId: "sample", status: "COMPLETED" },
    });
  });
  await page.route("**/api/reports/exports/sample/download", (route) =>
    route.fulfill({
      contentType: "text/csv",
      body: "collectedAmount,refundedAmount,netCollected\n100,20,80",
    }),
  );
  await page.goto("/manager/reports");
  await page.getByLabel("Compare with").selectOption("previous");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export period").selectOption("comparison");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect(page.getByText("Export downloaded.")).toBeVisible();
  expect(body).toMatchObject({
    fromDate: "2026-09-01",
    toDate: "2026-09-23",
    reportType: "REVENUE_SUMMARY",
    format: "Csv",
  });
});
for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [320, 800],
]) {
  test(`all report bookmarks fit ${width} and charts support keyboard`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/manager/reports");
    for (const name of ["Revenue", "Courts", "Classes", "Members"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(
        page.getByText(
          /Loading (revenue|court bookings|classes|daily buyers)…/,
        ),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      const slider = page.getByRole("slider").first();
      if (name !== "Classes") {
        await expect(slider).toBeVisible();
        await slider.focus();
        await page.keyboard.press("ArrowRight");
        await expect(slider).toHaveValue("1");
      }
      if (process.env.REPORT_SCREENSHOTS === "1") {
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `.tmp/reports-${name.toLowerCase()}-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
}

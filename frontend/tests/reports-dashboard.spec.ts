import { test, expect, type Page } from "@playwright/test";
import {
  monthPeriod,
  reportPeriods,
  changeLabel,
  validPeriod,
  periodDates,
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
  expect(periodDates(monthPeriod("2024-02-12"))).toHaveLength(29);
  expect(periodDates({ fromDate: "2026-04-29", toDate: "2026-05-01" })).toEqual(
    ["2026-04-29", "2026-04-30", "2026-05-01"],
  );
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
    if (path === "/api/manager/point-gifts/filters")
      return route.fulfill({ json: { sports: [], classes: [] } });
    if (path === "/api/manager/point-gifts/limits")
      return route.fulfill({
        json: {
          fromDate: "2026-10-01",
          toDate: today,
          vndPerPoint: 1000,
          maxPoints: 100,
        },
      });
    if (path.startsWith("/api/manager/point-gifts"))
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
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
        json: {
          userId: memberId,
          fullName: "Alex Member",
          email: "alex@example.test",
          role: "MEMBER",
        },
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
          pointsIssued: 75,
          managerPointAdjustment: 5,
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
            pointsRedeemed: i === 0 ? 200 : 0,
            pointsIssued: i === 0 ? 75 : 0,
            pointsRefunded: i === 0 ? 25 : 0,
            managerPointAdjustment: i === 0 ? 5 : 0,
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
  await page
    .getByLabel("Collection source", { exact: true })
    .selectOption("RENTAL");
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
  await page.getByRole("tab", { name: "Cash", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /More filters/ }),
  ).toHaveAttribute("aria-expanded", "true");
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
  await page.getByRole("tab", { name: "Gyms", exact: true }).click();
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
test("Export navigates to the dedicated export page", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/reports/exports**", (route) =>
    route.fulfill({
      json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
    }),
  );
  await page.goto("/manager/reports");
  const link = page.getByRole("link", { name: "Export", exact: true });
  await expect(link).toHaveAttribute(
    "href",
    /\/manager\/reports\/exports\?tab=revenue&fromDate=2026-10-01&toDate=2026-10-31/,
  );
  await link.click();
  await expect(page).toHaveURL(/\/manager\/reports\/exports\?/);
  await expect(
    page.getByRole("heading", { name: "Report exports", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Export period", { exact: true })).toHaveCount(
    0,
  );
});

test("Points has its own dashboard and member-only filters; Point Management keeps operations", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/manager/reports?tab=points");
  await expect(
    page.getByRole("tab", { name: "Points", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Current balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Daily point activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "After refunds", exact: true }),
  ).toHaveCount(0);
  await page.getByText("More filters", { exact: true }).click();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Collection source", { exact: true }),
  ).toHaveCount(0);
  await page.getByPlaceholder("Find a member").fill("Alex");
  await page.getByRole("button", { name: /Alex Member/ }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(() =>
      requests
        .filter((u) => u.pathname === "/api/reports/revenue")
        .at(-1)
        ?.searchParams.get("memberId"),
    )
    .toBe(memberId);
  const request = requests
    .filter((u) => u.pathname === "/api/reports/revenue")
    .at(-1)!;
  expect(request.searchParams.has("sportId")).toBe(false);
  expect(request.searchParams.has("source")).toBe(false);
  await page.getByRole("link", { name: "Open Point Management" }).click();
  await expect(page).toHaveURL(/\/manager\/points$/);
  await expect(
    page.getByRole("heading", { name: "Current balance", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Reports · Points", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("View balances and point activity in", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Gift points (0)", exact: true }),
  ).toBeVisible();
});
test("daily charts span the full selected month without inventing future financial activity", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/manager/reports");
  for (const name of ["Cash", "Points", "Courts", "Gyms"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const slider = page.getByRole("slider").first();
    await expect(slider).toHaveAttribute("max", "30");
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveValue("30");
    await expect(slider).toHaveAttribute("aria-valuetext", /31\/10\/2026/);
    if (name === "Courts") {
      await expect(slider).toHaveAttribute("aria-valuetext", /3 hours/);
    } else {
      await expect(slider).toHaveAttribute("aria-valuetext", /No data yet/);
    }
  }
  for (const url of requests.filter(
    (url) =>
      url.pathname === "/api/reports/revenue" ||
      url.pathname === "/api/reports/membership-period",
  )) {
    expect(url.searchParams.get("toDate")).toBe(today);
  }
});

test("full calendar charts preserve elapsed comparison data and custom cross-month periods", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  await page.goto("/manager/reports");
  await page
    .getByLabel("Compare with", { exact: true })
    .selectOption("previous");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const chart = page.getByRole("img", {
    name: "After refunds by day",
    exact: true,
  });
  await expect(chart.locator('path[stroke-dasharray="6 5"]')).toHaveCount(1);
  const slider = page.getByRole("slider").first();
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /31\/10\/2026.*No data yet/,
  );
  await page
    .getByLabel("Report period", { exact: true })
    .selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill("2026-04-29");
  await page.getByLabel("To", { exact: true }).fill("2026-05-04");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(slider).toHaveAttribute("max", "5");
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", /29\/04\/2026/);
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /04\/05\/2026/);
  await expect(slider).not.toHaveAttribute("aria-valuetext", /No data yet/);
  expect(errors).toEqual([]);
});

test("an entirely future reporting period still has a complete blank daily chart", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/manager/reports");
  await page
    .getByLabel("Report period", { exact: true })
    .selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill("2026-11-01");
  await page.getByLabel("To", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  for (const name of ["Cash", "Points", "Gyms"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    const slider = page.getByRole("slider").first();
    await expect(slider).toHaveAttribute("max", "29");
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      /30\/11\/2026.*No data yet/,
    );
  }
});

test("applied chips remain visible and Reset only clears the active bookmark", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/manager/reports");
  const more = page.getByRole("button", { name: /More filters/ });
  await more.click();
  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page
    .getByLabel("Collection source")
    .selectOption("CLASS_TRANSFER_DIFFERENCE");
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Compare with").selectOption("previous");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Class transfer payments");
  await expect(more).toContainText("2");
  await more.click();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Sport", { exact: true })).not.toBeVisible();

  await page.getByRole("tab", { name: "Courts", exact: true }).click();
  await more.click();
  await expect(page.getByLabel("Collection source")).toHaveCount(0);
  await page.getByLabel("Sport", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page.getByRole("tab", { name: "Cash", exact: true }).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByLabel("Applied filters", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Compare with")).toHaveValue("previous");
  await expect
    .poll(() =>
      requests
        .filter(
          (u) =>
            u.pathname === "/api/reports/revenue" &&
            u.searchParams.get("fromDate") === "2026-10-01",
        )
        .at(-1)
        ?.searchParams.has("sportId"),
    )
    .toBe(false);
  await page.getByRole("tab", { name: "Courts", exact: true }).click();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveValue("3");
  await expect(
    page.getByText("Changes not applied", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Basketball");
  await page.getByRole("tab", { name: "Classes", exact: true }).click();
  await more.click();
  await expect(page.getByLabel("Sport", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Find a member")).toHaveCount(0);
  await page.getByRole("tab", { name: "Gyms", exact: true }).click();
  await expect(more).toHaveCount(0);
});

test("Cash export carries applied dimensions and comparison; unapplied changes cannot export", async ({
  page,
}) => {
  await fixture(page);
  const jobs: Record<string, unknown>[] = [];
  await page.route("**/api/reports/exports**", async (route) => {
    if (route.request().method() === "POST") {
      jobs.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          reportExportId: "33333333-3333-4333-8333-333333333333",
          status: "PENDING",
        },
      });
    }
    return route.fulfill({
      json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
    });
  });
  await page.goto(
    `/manager/reports?tab=revenue&fromDate=2026-10-01&toDate=2026-10-31&compare=previous&sportId=3&source=RENTAL&memberId=${memberId}`,
  );
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Alex Member");
  await page.getByRole("link", { name: "Export", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Report exports", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /More filters/ }).click();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Collection source")).toHaveValue("RENTAL");
  await expect(
    page.getByText("alex@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").first().check();
  const submit = page.getByRole("button", { name: "Export", exact: true });
  await submit.click();
  await expect.poll(() => jobs.length).toBe(1);
  expect(jobs[0]).toMatchObject({
    reportType: "REVENUE_SUMMARY",
    fromDate: "2026-10-01",
    toDate: today,
    sportId: 3,
    source: "RENTAL",
    memberId,
  });
  await page
    .getByLabel("Export period", { exact: true })
    .selectOption("comparison");
  await submit.click();
  await expect.poll(() => jobs.length).toBe(2);
  expect(jobs[1]).toMatchObject({
    fromDate: "2026-09-01",
    toDate: "2026-09-23",
    sportId: 3,
    source: "RENTAL",
    memberId,
  });
  await page.getByLabel("Sport", { exact: true }).selectOption("4");
  await expect(submit).toBeDisabled();
  await expect(
    page.getByText("Changes not applied", { exact: true }),
  ).toBeVisible();
  expect(jobs).toHaveLength(2);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await submit.click();
  await expect.poll(() => jobs.length).toBe(3);
  expect(jobs[2].sportId).toBe(4);
  await page.getByRole("link", { name: /Back to reports/ }).click();
  await expect(
    page.getByRole("tab", { name: "Cash", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Basketball");
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Alex Member");
  await page.getByRole("link", { name: "Export", exact: true }).click();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Basketball");
  await page.reload();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Basketball");
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Alex Member");
});

test("Points export strips incompatible dimensions and future activity cannot be exported", async ({
  page,
}) => {
  await fixture(page);
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/reports/exports**", async (route) => {
    if (route.request().method() === "POST")
      payload = route.request().postDataJSON();
    return route.fulfill({
      json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
    });
  });
  await page.goto(
    `/manager/reports/exports?tab=points&fromDate=2026-10-01&toDate=2026-10-31&sportId=3&source=RENTAL&memberId=${memberId}`,
  );
  await page.getByRole("button", { name: /More filters/ }).click();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Collection source")).toHaveCount(0);
  await expect(
    page.getByText("alex@example.test", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").first().check();
  const submit = page.getByRole("button", { name: "Export", exact: true });
  await submit.click();
  await expect.poll(() => payload).toBeDefined();
  expect(payload).toMatchObject({
    reportType: "POINTS_SUMMARY",
    sportId: null,
    source: null,
    memberId,
    toDate: today,
  });
  await page
    .getByLabel("Report period", { exact: true })
    .selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill("2026-11-01");
  await page.getByLabel("To", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/No elapsed dates/)).toBeVisible();
});

test("catalog failures can retry without clearing an applied historical sport", async ({
  page,
}) => {
  const requests = await fixture(page);
  let broken = true;
  await page.route("**/api/manager/sports", (route) =>
    route.fulfill(
      broken
        ? {
            status: 503,
            json: { error: "unavailable", message: "Unavailable" },
          }
        : {
            json: [
              { sportId: 3, name: "Badminton" },
              { sportId: 8, name: "Tennis" },
            ],
          },
    ),
  );
  await page.goto("/manager/reports?tab=classes&sportId=9");
  await page.getByRole("button", { name: /More filters/ }).click();
  await expect(
    page.getByText("Sports unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Sport", { exact: true })).toBeDisabled();
  await expect(
    page.getByLabel("Applied filters", { exact: true }),
  ).toContainText("Sport 9");
  broken = false;
  await page
    .locator("#report-more-filters")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(page.getByLabel("Sport", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveValue("9");
  await expect(
    page.getByRole("option", { name: "Tennis", exact: true }),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      requests
        .filter((u) => u.pathname === "/api/reports/class-status")
        .at(-1)
        ?.searchParams.get("sportId"),
    )
    .toBe("9");
});

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [320, 800],
]) {
  test(`expanded report and export filters fit ${width}`, async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/reports/exports**", (route) =>
      route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
      }),
    );
    await page.goto(
      `/manager/reports?fromDate=2026-10-01&toDate=2026-10-31&sportId=3&source=RENTAL&memberId=${memberId}`,
    );
    await page.getByRole("button", { name: /More filters/ }).click();
    await expect(
      page.getByText("alex@example.test", { exact: true }),
    ).toBeVisible();
    const panel = page.locator("#report-more-filters");
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`filters-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Export", exact: true }).click();
    await page.getByRole("button", { name: /More filters/ }).click();
    await expect(
      page.getByText("alex@example.test", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`export-${width}.png`),
      fullPage: true,
    });
  });

  test(`all report bookmarks fit ${width} and charts support keyboard`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/manager/reports");
    for (const name of ["Cash", "Points", "Courts", "Classes", "Gyms"]) {
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

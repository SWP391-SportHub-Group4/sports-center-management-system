import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";
import { fillIncidentDateTime } from "./helpers/incident";

const paged = (items: unknown[]) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
});
const memberId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
async function fixture(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture-token"),
  );
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/users/me": {
        userId: "manager-1",
        role: "CENTER_MANAGER",
        fullName: "Manager fixture",
        email: "manager@example.test",
        status: "ACTIVE",
        hasPassword: true,
        sportIds: [],
      },
      "/api/manager/rooms": [
        {
          roomId: 7,
          name: "Court A",
          roomTypeId: 1,
          capacity: 12,
          isActive: true,
        },
      ],
      "/api/manager/classes": paged([
        {
          classId: 1,
          name: "Badminton autumn",
          code: "BAD-01",
          status: "PUBLISHED",
          thresholdStatus: "AT_RISK",
          breakEvenThreshold: 6,
          confirmedCount: 4,
          capacity: 12,
          roomName: "Court A",
          startDate: "2026-10-07",
          price: 300000,
        },
      ]),
      "/api/refunds": paged([
        {
          adjustmentId: "refund-1",
          invoiceNumber: "INV-OLD",
          systemCalculatedPoints: 120,
          reason: "Court unavailable",
          requestedByName: "Mai Anh",
        },
      ]),
      "/api/manager/incidents": paged([]),
      "/api/manager/court-schedule": [
        {
          sourceType: "CLASS_SESSION",
          sourceId: sessionId,
          classId: 1,
          title: "Badminton autumn",
          status: "SCHEDULED",
          roomId: 7,
          coachName: "Coach Linh",
          startAtUtc: "2026-10-07T02:00:00Z",
          endAtUtc: "2026-10-07T03:00:00Z",
          participants: [],
        },
      ],
      "/api/reports/revenue": {
        totalCollected: 100000,
        pointsRedeemedVnd: 0,
        pointsRedeemed: 0,
        pointsIssued: 0,
        outstandingPoints: 0,
      },
      "/api/reports/membership-period": {
        newMembers: 0,
        activeMembersAtPeriodEnd: 0,
      },
      "/api/reports/class-enrollment": { classes: [] },
      "/api/manager/class-session-change-requests/filters": {
        classes: [],
        coaches: [],
      },
      "/api/manager/class-session-change-requests": paged([]),
    };
    return route.fulfill({
      json: p.endsWith("unread-count") ? { count: 0 } : (data[p] ?? []),
    });
  });
}
test.beforeEach(({ page }) => fixture(page));

test("overview restores shortcut order, readable queues and the correct review links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/manager");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 2 }).first()).toHaveText(
    en.staffWork.quickLinks,
  );
  await expect(
    main.getByRole("link", { name: "Incidents", exact: true }),
  ).toHaveAttribute("href", "/manager/incidents");
  await expect(page.locator("#attention-classes")).toBeVisible();
  await expect(page.locator("#attention-refunds")).toBeVisible();
  await expect(page.locator("#attention-incidents")).toBeVisible();
  const classGroup = await page.locator("#attention-classes").boundingBox();
  const refundGroup = await page.locator("#attention-refunds").boundingBox();
  expect(refundGroup!.y).toBeCloseTo(classGroup!.y, 0);
  expect(refundGroup!.x).toBeGreaterThan(classGroup!.x);
  await expect(
    main.getByText(en.finOps.requestedBy.replace("{name}", "Mai Anh"), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(main.getByText("Reason: Court unavailable")).toBeVisible();
  await expect(
    main.getByRole("link", { name: en.managerOperations.reviewRefunds }),
  ).toHaveAttribute("href", "/manager/finance?tab=refunds");
});

test("busy attention queues scroll independently and stay usable on mobile", async ({
  page,
}, testInfo) => {
  const reason =
    "Please review the changed booking and contact the member. ".repeat(4);
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    const rows = Array.from({ length: 5 }, (_, index) => {
      if (p === "/api/manager/classes")
        return {
          classId: index + 1,
          name: `Badminton evening class ${index + 1}`,
          roomName: "Court A",
          confirmedCount: 4,
          breakEvenThreshold: 6,
          startDate: "2026-10-07",
        };
      if (p === "/api/refunds")
        return {
          adjustmentId: `refund-${index}`,
          invoiceNumber: `INV-${index + 1}`,
          requestedByName: "Mai Anh",
          systemCalculatedPoints: 120,
          reason,
        };
      if (p === "/api/manager/incidents")
        return {
          incidentId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
          reason: `Court maintenance ${index + 1}`,
          scope: index % 2 ? "CENTER" : "ROOM",
          roomName: "Court A",
          startAtUtc: "2030-10-22T02:00:00Z",
          endAtUtc: "2030-10-22T08:00:00Z",
        };
      return { requestId: `request-${index}`, reason };
    });
    if (
      p === "/api/manager/classes" ||
      p === "/api/refunds" ||
      p === "/api/manager/incidents"
    )
      return route.fulfill({ json: paged(rows) });
    return route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/manager");
  const queues = page.locator("main ul[aria-labelledby^='attention-']");
  await expect(queues).toHaveCount(3);
  await expect(
    queues
      .nth(2)
      .getByRole("link", { name: "Court maintenance 1", exact: true }),
  ).toHaveAttribute(
    "href",
    "/manager/incidents/11111111-1111-4111-8111-000000000001",
  );
  await expect(queues.nth(2)).toContainText(en.incidentHistory.entireCenter);
  for (const queue of await queues.all()) {
    await expect(queue.getByRole("listitem")).toHaveCount(5);
    expect(await queue.evaluate((el) => el.scrollHeight)).toBeGreaterThan(
      await queue.evaluate((el) => el.clientHeight),
    );
  }
  await queues.first().focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => queues.first().evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await queues.nth(1).evaluate((el) => el.scrollTop)).toBe(0);
  for (const width of [1440, 960, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width < 1024) {
      const first = await queues.first().boundingBox();
      const second = await queues.nth(1).boundingBox();
      expect(second!.y).toBeGreaterThan(first!.y + first!.height);
    }
    await page.screenshot({
      path: testInfo.outputPath(`needs-attention-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("queue load errors remain visible instead of looking like an empty queue", async ({
  page,
}) => {
  await page.route("**/api/refunds?**", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Refund queue unavailable" },
    }),
  );
  await page.goto("/manager");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Refund queue unavailable",
  );
  await expect(page.getByText(en.managerOperations.noRefunds)).toHaveCount(0);
});

test("week schedule queries Monday to Sunday, opens one drawer and retains team requests", async ({
  page,
}) => {
  const reads: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/manager/court-schedule"))
      reads.push(new URL(request.url()));
  });
  await page.goto("/manager/schedule?date=2026-10-07&view=week&roomId=7");
  await expect(
    page.getByRole("button", { name: /Badminton autumn/ }).first(),
  ).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("fromDate")).toBe("2026-10-05");
  expect(reads.at(-1)?.searchParams.get("toDate")).toBe("2026-10-11");
  expect(reads.at(-1)?.searchParams.get("roomId")).toBe("7");
  await page
    .getByRole("button", { name: /Badminton autumn/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Class change requests", exact: true })
    .click();
  await expect(page).toHaveURL(/section=requests/);
  await expect(
    page.getByRole("button", { name: "Activity calendar", exact: true }),
  ).toBeVisible();
});

test("incident date fields reject reversed ranges and keep preview errors", async ({
  page,
}) => {
  let previews = 0;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/api/manager/incidents/preview", (route) => {
    previews++;
    return route.fulfill({
      status: 409,
      json: { message: "Review the room availability" },
    });
  });
  await page.goto("/manager/incidents?roomId=7");
  await fillIncidentDateTime(page, en.operations.start, "2030-10-03T18:00");
  await fillIncidentDateTime(page, en.operations.end, "2030-10-03T17:00");
  await page.getByLabel("Reason", { exact: true }).fill("Water leak");
  await expect(
    page.getByRole("button", { name: "Review", exact: true }),
  ).toBeDisabled();
  expect(previews).toBe(0);
  await fillIncidentDateTime(page, en.operations.end, "2030-10-03T21:00");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Review the room availability",
  );
  await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
    "Water leak",
  );
  expect(previews).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  const accessibility = await new AxeBuilder({ page })
    .include("main form")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

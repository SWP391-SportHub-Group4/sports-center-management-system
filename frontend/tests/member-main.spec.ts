import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  let read = false;
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "member-1",
          email: "member@example.com",
          fullName: "Current Member",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path === "/api/notifications/unread-count")
      return route.fulfill({ json: { count: read ? 0 : 1 } });
    if (path.endsWith("/read") || path.endsWith("/read-all")) {
      read = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/notifications")
      return route.fulfill({
        json:
          read && url.searchParams.get("unreadOnly") === "true"
            ? []
            : [
                {
                  notificationId: "notice-1",
                  sourceEventType: "MANUAL_NOTICE",
                  sourceEntityId: null,
                  message: "Gym hours update",
                  status: read ? "READ" : "SENT",
                  sentAt: `${today}T01:00:00Z`,
                },
              ],
      });
    if (path === "/api/members/me/schedule")
      return route.fulfill({
        json: [
          {
            sessionId: "class-session",
            classId: 7,
            className: "Badminton course",
            sportName: "Badminton",
            sessionNo: 1,
            roomName: "Court A",
            startAtUtc: `${today}T10:00:00Z`,
            endAtUtc: `${today}T11:00:00Z`,
            status: "SCHEDULED",
            isMakeup: true,
            attendanceStatus: "PRESENT",
          },
        ],
      });
    if (path === "/api/members/me/pt-sessions") {
      const last = url.searchParams.get("page") === "2";
      return route.fulfill({
        json: Array.from({ length: last ? 1 : 50 }, (_, i) => ({
          sessionId: last ? "last-session" : `pt-${i}`,
          coachName: last ? "Coach Last" : `Coach ${i}`,
          startAtUtc: `${today}T12:00:00Z`,
          endAtUtc: `${today}T13:30:00Z`,
          status: "SCHEDULED",
          quotaState: "RESERVED",
          roomName: "Gym",
        })),
      });
    }
    if (path === "/api/members/me/enrollments")
      return route.fulfill({
        json: {
          items: [
            {
              classId: 7,
              enrollmentId: "enr-1",
              className: "Badminton course",
              classCode: "BAD-07",
              sportName: "Badminton",
              status: "CONFIRMED",
              classStatus: "PUBLISHED",
              numSessions: 12,
              firstSessionStartUtc: "2099-01-01T10:00:00Z",
              enrolledAt: `${today}T01:00:00Z`,
            },
          ],
          totalCount: 1,
        },
      });
    if (path === "/api/members/me/classes/7/sessions")
      return route.fulfill({
        json: [
          {
            sessionId: "class-session",
            sessionNo: 1,
            startAtUtc: `${today}T10:00:00Z`,
            endAtUtc: `${today}T11:00:00Z`,
            roomName: "Court A",
            coachName: "Coach A",
            status: "SCHEDULED",
            isMakeup: true,
          },
        ],
      });
    if (path === "/api/members/me/gym-checkins")
      return route.fulfill({
        json: {
          items: [
            {
              checkInId: "visit-1",
              checkInTime: `${today}T01:00:00Z`,
              checkOutTime: null,
            },
          ],
          totalCount: 1,
        },
      });
    if (path === "/api/members/me/pt-entitlements")
      return route.fulfill({
        json: [
          {
            entitlementId: "ent-1",
            coachName: "Coach A",
            status: "ACTIVE",
            totalQuota: 12,
            remainingQuota: 7,
            reservedSessions: 2,
            consumedSessions: 3,
            validityStartDate: today,
            validityEndDate: "2099-01-01",
            carryOverUntilDate: null,
          },
        ],
      });
    if (path === "/api/wallet/me")
      return route.fulfill({
        json: { availablePoints: 200, heldPoints: 0, vndPerPoint: 1000 },
      });
    if (path === "/api/members/me/invoices")
      return route.fulfill({ json: { items: [], totalCount: 0 } });
    return route.fulfill({ json: [] });
  });
}

test("schedule reuses Calendar and includes the last PT page and own attendance", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/member/schedule");
  await expect(
    page.getByText("PT · Coach Last", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Badminton course/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Make-up session");
  await expect(page.getByRole("dialog")).toContainText("Present");
  await page.getByRole("dialog").getByRole("link", { name: "Details" }).click();
  await expect(page).toHaveURL(/\/member\/courses\/7$/);
  await expect(page.getByText("BAD-07", { exact: false })).toBeVisible();
});

test("old routes retain query and services show visits and quota", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/member/my-plans?tab=visits&source=email");
  await expect(page).toHaveURL(/\/member\/services\?tab=visits&source=email/);
  await expect(page.getByText("Still at the gym")).toBeVisible();
  await page.getByRole("tab", { name: "Personal training" }).click();
  await expect(page.getByText("7 / 12")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Still at the gym")).toBeVisible();
});

test("notification read is persisted and unknown source has no fabricated link", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/notifications?tab=unread");
  await expect(page.getByText("Gym hours update")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Details" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await expect(page.getByText("Gym hours update")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as read", exact: true }),
  ).toHaveCount(0);
});

test("course details reject IDs outside own enrollments", async ({ page }) => {
  await setup(page);
  await page.goto("/member/courses/999");
  await expect(
    page.getByText("This enrollment is unavailable for your account."),
  ).toBeVisible();
});

test("schedule errors provide a retry without fake empty results", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/members/me/pt-sessions?**", (route) =>
    route.fulfill({ status: 500, json: { title: "Schedule unavailable" } }),
  );
  await page.goto("/member/schedule");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("No activities scheduled.")).toHaveCount(0);
});

test("member dashboard desktop and mobile fit the viewport", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/member");
  await expect(
    page.getByRole("heading", { name: "Next session" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/an02-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Language: English (Switch to VI)" }).click();
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await expect(
    page.getByRole("heading", { name: "Buổi tiếp theo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/an02-mobile.png",
    fullPage: true,
  });
});

test("enrollment filtering includes later pages and preserves tab on reload", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/members/me/enrollments?**", (route) => {
    const last =
      new URL(route.request().url()).searchParams.get("page") === "2";
    return route.fulfill({
      json: {
        items: Array.from({ length: last ? 1 : 50 }, (_, i) => ({
          classId: last ? 51 : i + 1,
          enrollmentId: last ? "last" : `enr-${i}`,
          className: last ? "Completed course" : `Future course ${i}`,
          status: "CONFIRMED",
          classStatus: last ? "COMPLETED" : "PUBLISHED",
          firstSessionStartUtc: "2099-01-01T10:00:00Z",
          numSessions: 12,
        })),
        totalCount: 51,
      },
    });
  });
  await page.goto("/member/my-registrations?tab=history");
  await expect(
    page.getByText("Completed course", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Future course 0", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "History", selected: true }),
  ).toBeVisible();
});

test("failed notification mutation keeps message unread", async ({ page }) => {
  await setup(page);
  await page.route("**/api/notifications/notice-1/read", (route) =>
    route.fulfill({ status: 500, json: { title: "Unable to mark read" } }),
  );
  await page.goto("/notifications?tab=unread");
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("Gym hours update")).toBeVisible();
});

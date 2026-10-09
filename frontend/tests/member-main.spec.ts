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
          hasPassword: true,
          status: "ACTIVE",
          createdAt: "2026-08-06T00:00:00Z",
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
            coachName: "Coach Minh",
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

test("member account keeps shared navigation and toggles each password independently", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/users/me/password", async (route) => {
    writes++;
    await route.fulfill({ json: { accessToken: "updated-token" } });
  });
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/account");
  await expect(
    page.getByRole("link", { name: "Discover", exact: true }),
  ).toHaveAttribute("href", "/member/discover");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Personal Information" }),
  ).toBeVisible();
  const current = page.getByLabel("Current password", { exact: true });
  const next = page.getByLabel("New password", { exact: true });
  const confirm = page.getByLabel("Confirm new password", { exact: true });
  for (const input of [current, next, confirm])
    await expect(input).toHaveAttribute("type", "password");
  await current.fill("Demo@123");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .first()
    .click();
  await expect(current).toHaveAttribute("type", "text");
  await expect(current).toHaveValue("Demo@123");
  await expect(next).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(current).toHaveAttribute("type", "password");
  expect(writes).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const rejection of [
  { status: 400, error: "current_password_incorrect" },
  { status: 401, error: "invalid_credentials" },
]) {
  test(`wrong current password (${rejection.status}) preserves session and allows retry`, async ({
    page,
  }) => {
    await setup(page);
    let attempts = 0;
    await page.route("**/api/users/me/password", (route) => {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? {
              status: rejection.status,
              json: {
                error: rejection.error,
                message: "Mật khẩu hiện tại không đúng.",
              },
            }
          : { json: { accessToken: "fresh-token" } },
      );
    });
    await page.goto("/account");
    const current = page.getByLabel("Current password", { exact: true });
    await current.fill("Wrong-Current-1!");
    await page
      .getByLabel("New password", { exact: true })
      .fill("Fresh-Pass-2!");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("Fresh-Pass-2!");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    // Có thêm vùng alert rỗng của Next (route announcer): chỉ xét lỗi của ô nhập.
    await expect(
      page.locator("[role=alert]:not(#__next-route-announcer__)"),
    ).toContainText("Current password is incorrect");
    await expect(page).toHaveURL(/\/account$/);
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute("aria-invalid", "true");
    expect(
      await page.evaluate(() => localStorage.getItem("sporthub.accessToken")),
    ).toBe("test-token");
    await current.fill("Correct-Current-1!");
    await expect(current).not.toHaveAttribute("aria-invalid", "true");
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await expect(
      page.getByText("Password updated successfully.", { exact: true }),
    ).toBeVisible();
    await expect(current).toHaveValue("");
    expect(
      await page.evaluate(() => localStorage.getItem("sporthub.accessToken")),
    ).toBe("fresh-token");
    expect(attempts).toBe(2);
  });
}

test("password change still signs out a genuinely expired session", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/users/me/password", (route) =>
    route.fulfill({ status: 401, json: { error: "token_expired" } }),
  );
  await page.goto("/account");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("Current-Pass-1!");
  await page.getByLabel("New password", { exact: true }).fill("Fresh-Pass-2!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Fresh-Pass-2!");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    await page.evaluate(() => localStorage.getItem("sporthub.accessToken")),
  ).toBeNull();
});

test("weekly schedule includes the last PT page and own attendance", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/member/schedule");
  await expect(page.getByText("Coach Last", { exact: true })).toBeVisible();
  await expect(page.getByText("Coach Minh", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("✓ Completed")).toHaveCount(0);
  await page.getByRole("button", { name: /Badminton course/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Make-up session");
  await expect(page.getByRole("dialog")).toContainText("Present");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "View course" })
    .click();
  await expect(page).toHaveURL(/\/member\/courses\/7$/);
  await expect(page.getByText("BAD-07", { exact: false })).toBeVisible();
});

test("weekly schedule orders sessions by start and then end time", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/members/me/schedule?**", (route) =>
    route.fulfill({
      json: [
        {
          sessionId: "long-session",
          classId: 8,
          className: "Long class",
          startAtUtc: "2030-06-10T00:00:00Z",
          endAtUtc: "2030-06-10T03:00:00Z",
          status: "SCHEDULED",
        },
        {
          sessionId: "afternoon-session",
          classId: 9,
          className: "Afternoon class",
          startAtUtc: "2030-06-10T07:00:00Z",
          endAtUtc: "2030-06-10T12:00:00Z",
          status: "SCHEDULED",
        },
        {
          sessionId: "short-session",
          classId: 7,
          className: "Short class",
          startAtUtc: "2030-06-10T00:00:00Z",
          endAtUtc: "2030-06-10T02:00:00Z",
          status: "SCHEDULED",
        },
      ],
    }),
  );
  await page.route("**/api/members/me/pt-sessions?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/member/schedule?date=2030-06-10");
  const mondayEvents = page
    .getByRole("region", { name: "Weekly schedule" })
    .locator("tbody tr td:first-child button");
  await expect(mondayEvents).toHaveCount(3);
  await expect(mondayEvents.nth(0)).toContainText("Short class");
  await expect(mondayEvents.nth(0)).toContainText("07:00–09:00");
  await expect(mondayEvents.nth(1)).toContainText("Long class");
  await expect(mondayEvents.nth(1)).toContainText("07:00–10:00");
  await expect(mondayEvents.nth(2)).toContainText("Afternoon class");
});

test("courses open on the first tab that has a course", async ({ page }) => {
  await setup(page);
  await page.goto("/member/courses");
  const tabs = page.getByRole("tablist").getByRole("tab");
  await expect(tabs.first()).toHaveText("In progress (0)");
  await expect(tabs.nth(1)).toHaveText("Upcoming (1)");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Badminton course", { exact: true }),
  ).toBeVisible();
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

for (const entry of ["bell", "list"] as const) {
  test(`notification ${entry} opens expiring package benefits`, async ({
    page,
  }) => {
    await setup(page);
    let read = false;
    await page.route("**/api/notifications**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/read")) {
        read = true;
        return route.fulfill({ status: 204 });
      }
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: read ? 0 : 1 } });
      return route.fulfill({
        json: [
          {
            notificationId: "package-notice",
            sourceEventType: "PACKAGE_EXPIRING",
            sourceEntityId: "package-1",
            actionUrl: "/member/services",
            message: "Your membership is expiring soon",
            status: read ? "READ" : "SENT",
            sentAt: "2026-10-08T10:00:00Z",
          },
        ],
      });
    });
    await page.goto("/notifications");
    if (entry === "bell") {
      await page
        .getByRole("button", { name: "Notifications (1)", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Notifications" })
        .getByRole("link", { name: /Your membership is expiring soon/ })
        .click();
    } else {
      await page
        .getByRole("main")
        .getByRole("link", { name: /Your membership is expiring soon/ })
        .click();
    }
    await expect(page).toHaveURL(/\/member\/services$/);
    expect(read).toBe(true);
  });
}
test("empty notification list does not claim 100 messages", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/notifications?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/notifications");
  await expect(
    page.getByText("You don't have any notifications yet."),
  ).toBeVisible();
  await expect(page.getByText(/latest 100 notifications/i)).toHaveCount(0);

  await page.getByRole("tab", { name: "Unread" }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/an02-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page
    .getByRole("button", { name: "Language: English (Switch to VI)" })
    .click();
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

test("Discover stays in Member shell through list and course details", async ({
  page,
}) => {
  await setup(page);
  const course = {
    classId: 7,
    name: "Badminton foundations",
    sportName: "Badminton",
    coachName: "Coach A",
    roomName: "Court A",
    startDate: "2099-01-01",
    numSessions: 12,
    availableSeats: 5,
    price: 300000,
    status: "PUBLISHED",
  };
  await page.route("**/api/classes?**", (route) =>
    route.fulfill({ json: { items: [course], totalCount: 1 } }),
  );
  await page.route("**/api/classes/7", (route) =>
    route.fulfill({ json: course }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/member");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Discover", exact: true })
    .click();
  await expect(page).toHaveURL(/\/member\/discover$/);
  await page.screenshot({
    path: "test-results/an02-discover.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("link", { name: "My schedule", exact: true }),
  ).toBeVisible();
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText(
    "Discover",
  );
  await page
    .getByRole("main")
    .getByRole("link", { name: "View details", exact: true })
    .click();
  await expect(page).toHaveURL(/\/member\/discover\/7$/);
  await expect(
    page.getByRole("link", { name: "My schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Badminton foundations" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText(
    "Discover",
  );
  await page.getByRole("link", { name: "Back to discovery" }).click();
  await expect(page).toHaveURL(/\/member\/discover$/);
  // Danh sách khóa công khai nay nằm ở mục Activities của trang chủ.
  await page.goto("/courses");
  await expect(page).toHaveURL(/#activities$/);
});

test("dashboard empty state offers Member discovery and handles API failure", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/members/me/schedule?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/members/me/pt-sessions?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/member");
  await expect(page.getByText("Your next session starts here.")).toBeVisible();
  await expect(page.getByText("No pending invoices.")).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Explore courses", exact: true }),
  ).toHaveAttribute("href", "/member/discover");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Gym & PT services" }),
  ).toHaveAttribute("href", "/member/services");
  await page.screenshot({
    path: "test-results/an02-dashboard-empty.png",
    fullPage: true,
  });
  await page.route("**/api/members/me/schedule?**", (route) =>
    route.fulfill({ status: 500, json: { title: "Schedule unavailable" } }),
  );
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("Your next session starts here.")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your membership" }),
  ).toBeVisible();
});

test("schedule reads the date from dashboard deep links", async ({ page }) => {
  await setup(page);
  const request = page.waitForRequest(
    (req) =>
      req.url().includes("/api/members/me/schedule") &&
      new URL(req.url()).searchParams.get("fromUtc") ===
        "2099-01-04T17:00:00.000Z",
  );
  await page.goto("/member/schedule?date=2099-01-10");
  await request;
  await expect(page).toHaveURL(/date=2099-01-10/);
  await expect(page.getByRole("columnheader")).toHaveCount(7);
  await expect(page.getByRole("columnheader").first()).toContainText(
    "Mon (05/01)",
  );
  await expect(page.getByRole("columnheader").last()).toContainText(
    "Sun (11/01)",
  );
  await expect(
    page.getByRole("button", { name: "Day", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("columnheader").first()).toContainText(
    "Mon (12/01)",
  );
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("columnheader").first()).toContainText(
    "Mon (19/01)",
  );
});

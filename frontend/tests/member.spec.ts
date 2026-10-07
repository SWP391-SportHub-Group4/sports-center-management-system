import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const course = {
  classId: 1,
  code: "BAD-01",
  name: "Badminton course",
  sportId: 3,
  sportName: "Badminton",
  coachId: "coach-1",
  coachName: "Coach",
  defaultRoomId: 1,
  roomName: "Court 1",
  startDate: "2026-10-12",
  numSessions: 6,
  capacity: 12,
  availableSeats: 8,
  price: 200000,
  status: "PUBLISHED",
  firstSessionStartUtc: "2026-10-12T11:00:00Z",
  scheduleRules: [],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/users/me")
      json = {
        userId: "member-1",
        email: "member@example.com",
        fullName: "Current Member",
        role: "MEMBER",
        sportIds: [],
      };
    else if (path.endsWith("/wallet/me"))
      json = {
        ownerUserId: "member-1",
        availablePoints: 500,
        heldPoints: 10,
        vndPerPoint: 1000,
      };
    else if (path === "/api/sports")
      json = [
        {
          sportId: 3,
          name: "Badminton",
          code: "course",
          services: [
            {
              serviceType: "GROUP_COURSE",
              isEnabled: true,
              defaultSessionMinutes: 90,
              defaultMaxCapacity: 12,
            },
          ],
          isActive: true,
        },
        {
          sportId: 2,
          name: "PT",
          code: "gym",
          services: [
            {
              serviceType: "PERSONAL_TRAINING",
              isEnabled: true,
              defaultSessionMinutes: null,
              defaultMaxCapacity: null,
            },
          ],
          isActive: true,
        },
      ];
    else if (path === "/api/classes")
      json = { items: [course], page: 1, pageSize: 12, totalCount: 1 };
    else if (path === "/api/classes/1") json = course;
    else if (path.endsWith("/enrollments"))
      json = {
        items: [
          {
            enrollmentId: "enrollment-1",
            classId: 1,
            className: "Badminton course",
            sportName: "Badminton",
            status: "CONFIRMED",
            classStatus: "PUBLISHED",
            invoiceItemId: null,
          },
        ],
        page: 1,
        pageSize: 10,
        totalCount: 1,
      };
    else if (path.endsWith("/invoices"))
      json = { items: [], page: 1, pageSize: 10, totalCount: 0 };
    else if (path.endsWith("/membership-packages"))
      json = [
        {
          packageId: 1,
          name: "Gym monthly",
          price: 600000,
          durationDays: 30,
          isActive: true,
          description: "Gym access",
        },
      ];
    else if (path.endsWith("/packages"))
      json = [
        {
          memberPackageId: "package-1",
          packageId: 1,
          packageName: "Gym monthly",
          startDate: "2026-10-01",
          endDate: "2026-10-30",
          status: "ACTIVE",
          isUsable: true,
        },
      ];
    else if (path.endsWith("/training-profile"))
      json = {
        memberId: "member-1",
        goal: "Run 10km",
        experienceLevel: "Beginner",
        notes: null,
        updatedAt: "2026-10-01T00:00:00Z",
      };
    else if (path === "/api/notifications")
      json = [
        {
          notificationId: "notification-1",
          sourceEventType: "HOMEWORK_ASSIGNED",
          sourceEntityId: null,
          message: "Your coach assigned homework.",
          status: "PENDING",
          sentAt: "2026-10-01T00:00:00Z",
        },
      ];
    else if (path.endsWith("/unread-count")) json = { count: 1 };
    await route.fulfill({ json });
  });
});
test("course catalog replaces per-session enrollment", async ({ page }) => {
  await page.goto("/member/discover");
  await expect(
    page.getByRole("heading", { name: "Badminton course" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /Book Spot/ })).toHaveCount(0);
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(page).toHaveURL(/\/member\/discover\/1$/);
  await expect(
    page.getByRole("button", { name: "Checkout", exact: true }),
  ).toBeVisible();
});
test("profile validation and training goal edits persist", async ({ page }) => {
  await page.goto("/member/profile");
  const input = page.locator("input[required]").first();
  await expect(input).toBeVisible();
  await input.fill("Run a 10km marathon");
  await page.getByRole("button", { name: /Save Profile/ }).click();
  await expect(page.getByRole("status")).toBeVisible();
});
test("dashboard does not issue an entrance pass", async ({ page }) => {
  await page.goto("/member");
  await expect(page.locator("#main-content h1")).toBeVisible();
  await expect(page.getByTestId("show-qr-btn")).toHaveCount(0);
});
test("Gym and PT purchases are separate", async ({ page }) => {
  await page.goto("/member/services");
  await expect(
    page.getByRole("heading", { name: "Gym membership packages", exact: true }),
  ).toBeVisible();
  // Fixture đã có đúng gói này đang hiệu lực: không mua trùng, kèm lý do.
  await expect(page.getByText(/You already have this package/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & checkout" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Personal training" }).click();
  await expect(
    page.getByRole("heading", { name: "Personal training", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeDisabled();
});
test("notification links resolve to real Member views", async ({ page }) => {
  await page.goto("/member");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const notifications = page.getByRole("region", { name: "Notifications" });
  const homework = notifications.getByRole("link", {
    name: /Your coach assigned homework\./,
  });
  await expect(homework).toBeVisible({ timeout: 15000 });
  await expect(homework).toHaveAttribute("href", "/member/training");
});
for (const width of [320, 768, 1024, 1280, 1360, 1440])
  test(`Member routes fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "",
      "/class-schedule",
      "/my-registrations",
      "/my-plans",
      "/profile",
      "/invoices",
      "/training",
      "/wallet",
    ]) {
      await page.goto(`/member${path}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      if (width >= 1360) {
        const nav = page.getByRole("navigation", { name: "Member Navigation" });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link")).toHaveCount(8);
      } else {
        await expect(
          page.getByRole("button", { name: "Open navigation menu" }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
    }
  });
test("Member pages pass WCAG A/AA", async ({ page }) => {
  test.setTimeout(90000);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "",
      "/class-schedule",
      "/my-registrations",
      "/my-plans",
      "/profile",
      "/invoices",
      "/training",
      "/wallet",
    ]) {
      await page.goto(`/member${path}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, path).toEqual([]);
    }
  }
});
test("the member header stays mounted and pinned while moving between tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/member");
  const nav = page.getByRole("navigation", { name: "Member Navigation" });
  await expect(nav).toBeVisible();
  // Đánh dấu node header: nếu chuyển trang dựng lại khung thì cờ này biến mất.
  await page.evaluate(() => {
    (document.querySelector("header") as HTMLElement).dataset.mounted = "yes";
  });
  for (const name of ["My schedule", "Gym & PT", "Finance", "Dashboard"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("header[data-mounted='yes']")).toHaveCount(1);
  }
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(300);
  const top = await page
    .locator("header")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBe(0);
});

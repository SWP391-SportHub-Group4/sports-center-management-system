import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const courseStart = new Date(Date.now() + 30 * 86400000).toISOString();
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
  startDate: courseStart.slice(0, 10),
  numSessions: 6,
  capacity: 12,
  availableSeats: 8,
  price: 200000,
  status: "PUBLISHED",
  firstSessionStartUtc: courseStart,
  scheduleRules: [],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/members/me/bmi-profile") {
      await route.fulfill({ status: 204 });
      return;
    }
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
          packageId: 50000,
          name: "Gym day pass",
          price: 50000,
          durationDays: 1,
          isActive: true,
          description: "Gym access only on the payment day.",
        },
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
          sourceEventType: "SCHEDULE_CHANGED",
          sourceEntityId: null,
          message: "Your class schedule changed.",
          status: "PENDING",
          sentAt: "2026-10-01T00:00:00Z",
        },
      ];
    else if (path.endsWith("/unread-count")) json = { count: 1 };
    await route.fulfill({ json });
  });
});
test("course catalog replaces per-session enrollment", async ({ page }) => {
  const invoiceId = "55555555-5555-4555-8555-555555555555";
  let checkoutRequest: unknown;
  await page.route("**/api/checkouts/class", async (route) => {
    checkoutRequest = route.request().postDataJSON();
    await route.fulfill({ json: { invoiceId } });
  });
  await page.route("**/api/members/me/enrollments?*", (route) =>
    route.fulfill({
      json: { items: [], page: 1, pageSize: 100, totalCount: 0 },
    }),
  );
  await page.goto("/member/discover");
  await expect(
    page.getByRole("heading", { name: "Badminton course" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /Book Spot/ })).toHaveCount(0);
  await page.getByRole("listitem").filter({ hasText: "Badminton course" })
    .getByRole("button", { name: "Select" }).click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${invoiceId}$`));
  expect(checkoutRequest).toEqual({ classId: 1 });
});
test("registered courses cannot be purchased a second time", async ({
  page,
}) => {
  await page.goto("/member/services/courses/1");
  await expect(
    page.getByText("You are registered for this class", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View registered class" }),
  ).toHaveAttribute("href", "/member/schedule?course=1");
  await expect(
    page.getByRole("button", { name: "Payment", exact: true }),
  ).toHaveCount(0);
});

test("legacy profile link opens the editable fitness profile", async ({ page }) => {
  await page.route("**/api/members/me/training-profile", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/member/profile");
  await expect(page).toHaveURL(/\/member\/training\?tab=profile$/);
  await expect(page.getByRole("heading", { name: "Fitness profile" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Height (cm)" }).fill("175");
  await page.getByRole("spinbutton", { name: "Weight (kg)", exact: true }).fill("70");
  await expect(page.getByRole("region", { name: "BMI" })).toContainText("22.9");
});

test("saved self-reported measurements remain editable", async ({ page }) => {
  await page.route("**/api/members/me/training-profile", (route) =>
    route.fulfill({
      json: {
        memberId: "member-1",
        goal: "Build strength",
        goalType: "BUILD_MUSCLE",
        experienceLevel: "BEGINNER",
        notes: null,
        updatedAt: "2026-10-02T00:00:00Z",
        dateOfBirth: "2000-01-01",
        age: 26,
        sex: "MALE",
        heightCm: 175,
        weightKg: 70,
        targetWeightKg: null,
        bmi: 22.9,
        bmiCategory: "NORMAL",
        activityLevel: "MODERATELY_ACTIVE",
        trainingDaysPerWeek: 3,
        sessionMinutes: null,
        dietaryPreference: "NO_PREFERENCE",
        foodAllergies: null,
        isComplete: true,
        recentMeasurements: [],
      },
    }),
  );
  await page.goto("/member/profile");
  await expect(page.getByRole("spinbutton", { name: "Height (cm)" })).toHaveValue("175");
  await expect(page.getByRole("spinbutton", { name: "Weight (kg)", exact: true })).toHaveValue("70");
  await expect(page.getByRole("region", { name: "BMI" })).toContainText("22.9");
});
test("dashboard does not issue an entrance pass", async ({ page }) => {
  await page.goto("/member");
  await expect(page.locator("#main-content h1")).toBeVisible();
  await expect(page.getByTestId("show-qr-btn")).toHaveCount(0);
});
test("Gym day pass clearly warns about same-day use and PT is absent", async ({ page }) => {
  await page.goto("/member/services?section=gym&view=explore");
  await expect(
    page.getByRole("heading", { name: "Gym Membership", exact: true }),
  ).toBeVisible();

  // Owned memberships live in My services; Explore packages intentionally shows
  // purchasable tiers and no longer embeds an "Active until" action in the catalog.
  await page.getByRole("button", { name: "My services", exact: true }).click();
  const gymMembership = page
    .locator("article[data-kind='gym']")
    .filter({ has: page.getByRole("heading", { name: "Gym monthly" }) });
  await expect(gymMembership).toBeVisible();
  await expect(gymMembership).toContainText("Active");

  await page
    .getByRole("button", { name: "Explore packages", exact: true })
    .click();
  await expect(page.getByText("Gym day pass", { exact: true })).toBeVisible();
  await expect(page.getByText(/Valid only on the payment day/)).toBeVisible();
  await expect(page.getByRole("button", { name: /PT 1/ })).toHaveCount(0);
});
test("notification links resolve to real Member views", async ({ page }) => {
  await page.goto("/member");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const notifications = page.getByRole("region", { name: "Notifications" });
  const notice = notifications.getByRole("link", {
    name: /Your class schedule changed\./,
  });
  await expect(notice).toBeVisible({ timeout: 15000 });
  await expect(notice).toHaveAttribute("href", "/member/schedule");
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
      if (path === "/profile") {
        await expect(page.getByRole("heading", { name: "Fitness profile" })).toBeVisible();
      }
      if (width >= 1360) {
        const nav = page.getByRole("navigation", { name: "Member Navigation" });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link")).toHaveCount(5);
      } else {
        await expect(
          page.getByRole("button", { name: "Open navigation menu" }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `Member route /member${path} should fit ${width}px`,
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
  for (const name of ["My schedule", "Services", "Billing", "Overview"]) {
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

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const courseStart = new Date(Date.now() + 30 * 86400000).toISOString();

const experienceInvoice = "a5555555-5555-4555-8555-555555555555";
const experienceCheckout = (paid = false) => ({
  invoiceId: experienceInvoice,
  checkoutSessionId: "b5555555-5555-4555-8555-555555555555",
  revision: 1,
  kind: "MEMBERSHIP",
  state: paid ? "COMPLETED" : "ACTIVE",
  totalAmount: 50000,
  pointsApplied: 0,
  cashAmount: 50000,
  expiresAtUtc: new Date(Date.now() + 900000).toISOString(),
  resourceHoldId: null,
  invoiceStatus: paid ? "PAID" : "ISSUED",
  fulfillmentOutcome: paid ? "FULFILLED" : "PENDING",
  reconciliationRequired: false,
  beneficiaryUserId: "member-1",
  initiatorUserId: "member-1",
  serverNowUtc: new Date().toISOString(),
  isDayPass: true,
});

test("Member experience: resumed day-pass checkout shows its terms before payment", async ({
  page,
}) => {
  await page.route(`**/api/checkouts/${experienceInvoice}`, (r) =>
    r.fulfill({ json: experienceCheckout() }),
  );
  await page.route(`**/api/invoices/${experienceInvoice}`, (r) =>
    r.fulfill({
      json: {
        summary: {
          invoiceId: experienceInvoice,
          invoiceNumber: "SH-TEST",
          status: "ISSUED",
          totalAmount: 50000,
        },
        items: [
          { itemId: "item", description: "Gym day pass", lineAmount: 50000 },
        ],
        payments: [],
        adjustments: [],
      },
    }),
  );
  await page.goto(`/checkout/${experienceInvoice}`);
  await expect(page.getByRole("note")).toContainText("valid only today");
  await expect(page.getByRole("note")).toContainText("not refundable");
  await page.reload();
  await expect(page.getByRole("note")).toContainText("not refundable");
});

test("Member experience: successful payment downloads the authenticated invoice PDF", async ({
  page,
}) => {
  await page.route(`**/api/checkouts/${experienceInvoice}`, (r) =>
    r.fulfill({ json: experienceCheckout(true) }),
  );
  await page.route(`**/api/invoices/${experienceInvoice}`, (r) =>
    r.fulfill({
      json: {
        summary: {
          invoiceId: experienceInvoice,
          invoiceNumber: "SH-PAID",
          status: "PAID",
          totalAmount: 50000,
        },
        items: [],
        payments: [],
        adjustments: [],
      },
    }),
  );
  let authorized = false;
  await page.route(
    `**/api/invoices/${experienceInvoice}/receipt.pdf`,
    (route) => {
      authorized =
        route.request().headers().authorization === "Bearer test-token";
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.4\n%%EOF",
      });
    },
  );
  await page.goto(`/checkout/${experienceInvoice}`);
  await expect(
    page.getByRole("heading", { name: "Payment successful", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download invoice", exact: true })
    .click();
  expect((await download).suggestedFilename()).toContain(".pdf");
  expect(authorized).toBe(true);
});

test("Member experience: an open class view clears its content when access is revoked", async ({
  page,
}) => {
  let revoked = false;
  await page.route("**/api/members/me/classes/1/sessions", (route) =>
    revoked
      ? route.fulfill({
          status: 403,
          json: {
            error: "class_access_ended",
            message: "Class access has ended",
          },
        })
      : route.fulfill({ json: [] }),
  );
  await page.route("**/api/members/me/classes/1/teaching-records**", (route) =>
    revoked
      ? route.fulfill({
          status: 403,
          json: {
            error: "class_access_ended",
            message: "Class access has ended",
          },
        })
      : route.fulfill({
          json: {
            items: [
              {
                recordId: "notice",
                classId: 1,
                kind: "NOTICE",
                title: "Private class material",
                content: "Instructions for enrolled students",
                updatedAtUtc: new Date().toISOString(),
                memberId: null,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 100,
          },
        }),
  );
  await page.goto("/member/schedule?course=1");
  await expect(
    page.getByRole("heading", { name: "Private class material", exact: true }),
  ).toBeVisible();
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Class access has ended", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Instructions for enrolled students", { exact: true }),
  ).toHaveCount(0);
});
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
  enrollmentOpen: true,
  firstSessionStartUtc: courseStart,
  scheduleRules: [],
};

const gymPurchase = (packageId: number, status: string, endDate: string) => ({
  memberPackageId: `${packageId}-${status}-${endDate}`,
  packageId,
  packageName: packageId === 50000 ? "Gym day pass" : "Gym monthly",
  startDate: "2026-10-01",
  endDate,
  status,
  isUsable: status === "ACTIVE",
});

test("Gym purchase: active day pass is locked and long plans can renew using the latest paid expiry", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T10:00:00Z") });
  await page.route("**/api/members/me/packages", (route) =>
    route.fulfill({
      json: [
        gymPurchase(50000, "Active", "2026-10-15"),
        gymPurchase(1, "ACTIVE", "2026-10-30"),
        {
          ...gymPurchase(1, "Active", "2026-11-30"),
          startDate: "2026-10-31",
          isUsable: false,
        },
      ],
    }),
  );
  await page.goto("/member/services?type=gym");
  const plans = page.getByRole("region", { name: "Gym plans", exact: true });
  const day = plans.getByRole("article").filter({ hasText: "Gym day pass" });
  const monthly = plans.getByRole("article").filter({ hasText: "Gym monthly" });
  await expect(
    day.getByRole("button", { name: "Purchased", exact: true }),
  ).toBeDisabled();
  await expect(
    day.getByText("Purchased · until 15/10/2026", { exact: true }),
  ).toBeVisible();
  await expect(
    monthly.getByRole("button", { name: "Renew plan", exact: true }),
  ).toBeEnabled();
  await expect(
    monthly.getByText("Purchased · until 30/11/2026", { exact: true }),
  ).toBeVisible();
  await expect(
    monthly.getByText("Purchased · until 30/10/2026", { exact: true }),
  ).toHaveCount(0);
});

test("Gym purchase: expired plans hide ownership and the day pass can be bought again", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T10:00:00Z") });
  await page.route("**/api/members/me/packages", (route) =>
    route.fulfill({
      json: [
        gymPurchase(50000, "ACTIVE", "2026-10-14"),
        gymPurchase(1, "Expired", "2026-09-30"),
      ],
    }),
  );
  const invoiceId = "55555555-5555-4555-8555-555555555555";
  let requestBody: unknown;
  await page.route("**/api/checkouts/membership", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: { invoiceId } });
  });
  await page.goto("/member/services?type=gym");
  const plans = page.getByRole("region", { name: "Gym plans", exact: true });
  await expect(
    plans.getByRole("button", { name: "Renew plan", exact: true }),
  ).toHaveCount(2);
  await expect(plans.getByText(/^Purchased · Until/)).toHaveCount(0);
  await plans
    .getByRole("article")
    .filter({ hasText: "Gym day pass" })
    .getByRole("button", { name: "Renew plan", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${invoiceId}$`));
  expect(requestBody).toEqual({ packageId: 50000, allowStacking: false });
});

test("Gym purchase: unpaid and cancelled purchases do not count as paid history", async ({
  page,
}) => {
  const invoiceId = "55555555-5555-4555-8555-555555555555";
  let checkoutPosts = 0;
  await page.route("**/api/checkouts/membership", async (route) => {
    checkoutPosts++;
    await route.fulfill({ json: { invoiceId } });
  });
  await page.route("**/api/members/me/packages", (route) =>
    route.fulfill({
      json: [
        gymPurchase(50000, "Cancelled", "2026-10-15"),
        gymPurchase(1, "PendingPayment", "2026-10-30"),
      ],
    }),
  );
  await page.goto("/member/services?type=gym");
  const plans = page.getByRole("region", { name: "Gym plans", exact: true });
  await expect(
    plans
      .getByRole("article")
      .filter({ hasText: "Gym day pass" })
      .getByRole("button", { name: "Choose plan", exact: true }),
  ).toBeEnabled();
  await expect(
    plans.getByRole("button", { name: "Continue payment", exact: true }),
  ).toBeEnabled();
  await expect(plans.getByText(/^Purchased · Until/)).toHaveCount(0);
  await plans.getByRole("button", { name: "Continue payment" }).click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${invoiceId}$`));
  expect(checkoutPosts).toBe(1);
});

test("Gym purchase: day pass expires at Vietnam midnight while the page stays open", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T16:59:50Z") });
  await page.route("**/api/members/me/packages", (route) =>
    route.fulfill({ json: [gymPurchase(50000, "ACTIVE", "2026-10-15")] }),
  );
  await page.goto("/member/services?type=gym");
  const day = page
    .getByRole("region", { name: "Gym plans", exact: true })
    .getByRole("article")
    .filter({ hasText: "Gym day pass" });
  await expect(
    day.getByRole("button", { name: "Purchased", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(11_000);
  await expect(
    day.getByRole("button", { name: "Renew plan", exact: true }),
  ).toBeEnabled();
  await expect(day.getByText(/^Purchased · Until/)).toHaveCount(0);
});

test("Gym purchase: returning from payment refreshes ownership", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-15T10:00:00Z") });
  let paid = false;
  await page.route("**/api/members/me/packages", (route) =>
    route.fulfill({
      json: paid ? [gymPurchase(50000, "ACTIVE", "2026-10-15")] : [],
    }),
  );
  await page.goto("/member/services?type=gym");
  const day = page
    .getByRole("region", { name: "Gym plans", exact: true })
    .getByRole("article")
    .filter({ hasText: "Gym day pass" });
  await expect(
    day.getByRole("button", { name: "Choose plan", exact: true }),
  ).toBeEnabled();
  paid = true;
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(
    day.getByRole("button", { name: "Purchased", exact: true }),
  ).toBeDisabled();
});

test("Gym purchase: an ownership API failure offers retry instead of a duplicate purchase", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/members/me/packages", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: "unavailable", message: "Unavailable" },
        })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/member/services?type=gym");
  const gym = page.getByRole("region", { name: "Gym Membership", exact: true });
  await expect(
    gym.getByText("Could not load your purchased plans."),
  ).toBeVisible();
  await expect(
    gym.getByRole("button", { name: "Choose plan", exact: true }),
  ).toHaveCount(0);
  failed = false;
  await gym.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose plan", exact: true }),
  ).toHaveCount(2);
});
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
    else if (
      path === "/api/notifications" ||
      path === "/api/notifications/inbox"
    ) {
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
      if (path.endsWith("/inbox"))
        json = { items: json, totalCount: 1, page: 1, pageSize: 25 };
    } else if (path.endsWith("/unread-count")) json = { count: 1 };
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
  await page
    .getByRole("listitem")
    .filter({ hasText: "Badminton course" })
    .getByRole("button", { name: "Select" })
    .click();
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

test("Training page keeps the editable fitness profile tab", async ({
  page,
}) => {
  await page.route("**/api/members/me/training-profile", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/member/training?tab=profile");
  await expect(page).toHaveURL(/\/member\/training\?tab=profile$/);
  await expect(
    page.getByRole("tab", { name: "Fitness profile" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("spinbutton", { name: "Height (cm)" }).fill("175");
  await page
    .getByRole("spinbutton", { name: "Weight (kg)", exact: true })
    .fill("70");
  await expect(page.getByRole("region", { name: "BMI" })).toContainText("22.9");
});

test("Training restores plans and results for active classes", async ({
  page,
}) => {
  await page.route("**/api/members/me/classes/1/teaching-records?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            recordId: "plan-1",
            classId: 1,
            sessionId: null,
            memberId: null,
            coachId: "coach-1",
            kind: "PLAN",
            title: "Weekly plan",
            content: "Practice footwork",
            score: null,
            dueAtUtc: null,
            createdAtUtc: "2026-10-01T00:00:00Z",
            updatedAtUtc: "2026-10-01T00:00:00Z",
            version: 1,
          },
          {
            recordId: "result-1",
            classId: 1,
            sessionId: "session-1",
            memberId: "member-1",
            coachId: "coach-1",
            kind: "RESULT",
            title: "First assessment",
            content: "Good progress",
            score: 4,
            dueAtUtc: null,
            createdAtUtc: "2026-10-02T00:00:00Z",
            updatedAtUtc: "2026-10-02T00:00:00Z",
            version: 1,
          },
        ],
        page: 1,
        pageSize: 100,
        totalCount: 2,
      },
    }),
  );
  await page.goto("/member/training?tab=plans");
  await expect(
    page.getByRole("heading", { name: "Weekly plan" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Results & progress" }).click();
  await expect(
    page.getByRole("heading", { name: "First assessment" }),
  ).toBeVisible();
  await expect(page.getByText("Good progress")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Badminton course" }),
  ).toHaveAttribute("href", "/member/schedule?course=1");
});

test("Training does not request coach content after enrollment ends", async ({
  page,
}) => {
  let recordRequests = 0;
  await page.route("**/api/members/me/enrollments?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            enrollmentId: "enrollment-1",
            classId: 1,
            className: "Badminton course",
            sportName: "Badminton",
            status: "CONFIRMED",
            classStatus: "PUBLISHED",
            endedAt: "2026-10-15T00:00:00Z",
            invoiceItemId: null,
          },
        ],
        page: 1,
        pageSize: 50,
        totalCount: 1,
      },
    }),
  );
  await page.route(
    "**/api/members/me/classes/1/teaching-records?**",
    (route) => {
      recordRequests++;
      return route.fulfill({ status: 403 });
    },
  );
  await page.goto("/member/training?tab=plans");
  await expect(
    page.getByText(
      "No coach content is available in your current classes yet.",
    ),
  ).toBeVisible();
  expect(recordRequests).toBe(0);
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
  await page.goto("/member/training?tab=profile");
  await expect(
    page.getByRole("spinbutton", { name: "Height (cm)" }),
  ).toHaveValue("175");
  await expect(
    page.getByRole("spinbutton", { name: "Weight (kg)", exact: true }),
  ).toHaveValue("70");
  await expect(page.getByRole("region", { name: "BMI" })).toContainText("22.9");
});
test("dashboard does not issue an entrance pass", async ({ page }) => {
  await page.goto("/member");
  await expect(page.locator("#main-content h1")).toBeVisible();
  await expect(page.getByTestId("show-qr-btn")).toHaveCount(0);
});
test("Gym day pass clearly warns about same-day use and PT is absent", async ({
  page,
}) => {
  // Align the browser clock with this test's fixed October membership dates.
  await page.clock.install({ time: new Date("2026-10-02T03:00:00Z") });
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
  await expect(
    page.getByRole("heading", { name: "Gym day pass" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Valid for 24 hours/)).toBeVisible();
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
  await expect(notice).toHaveAttribute(
    "href",
    "/notifications?message=notification-1",
  );
  await notice.click();
  const reader = page.getByRole("region", {
    name: "Message reader",
    exact: true,
  });
  await expect(
    reader.getByText("Your class schedule changed.", { exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByRole("link", { name: "Review schedule change" }),
  ).toHaveAttribute("href", "/member/schedule");
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
        await expect(page).toHaveURL(/\/member\/training\?tab=profile$/);
        await expect(
          page.getByRole("tab", { name: "Fitness profile" }),
        ).toHaveAttribute("aria-selected", "true");
      }
      if (width >= 960) {
        const nav = page.getByRole("navigation", { name: "Member Navigation" });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link")).toHaveText([
          "Overview",
          "Services",
          "My schedule",
          "Training",
        ]);
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
  for (const name of ["My schedule", "Services", "Overview"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("header[data-mounted='yes']")).toHaveCount(1);
  }
  await page.getByTestId("user-profile-button").click();
  const billing = page.getByRole("link", { name: "Billing", exact: true });
  await expect(billing).toBeVisible();
  await billing.click();
  await expect(page).toHaveURL(/\/member\/finance$/);
  await expect(page.locator("header[data-mounted='yes']")).toHaveCount(1);
  await expect(
    nav.getByRole("link", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  await page.getByTestId("user-profile-button").click();
  await expect(
    page.getByRole("link", { name: "Billing", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(300);
  const top = await page
    .getByRole("banner")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBe(0);
});

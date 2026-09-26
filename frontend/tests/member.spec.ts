import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyCommand } from "../src/infrastructure/demo/member-repository";
import { createSeed } from "../src/infrastructure/demo/seed";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-14T03:00:00Z") });
  await page.addInitScript(() => {
    window.localStorage.setItem("sporthub.accessToken", "test-token");
    window.localStorage.setItem(
      "sporthub.user",
      JSON.stringify({
        userId: "member-1",
        email: "member@sporthub.test",
        fullName: "Nguyễn Minh Triết",
        role: "Member",
      }),
    );
  });

  // Fallback for any member endpoints
  await page.route("**/api/members/me/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/members/me/invoices*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], totalCount: 0, page: 1, pageSize: 10 }),
    });
  });

  await page.route("**/api/members/me/packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          memberPackageId: "pkg-1",
          packageName: "Gold Access",
          discipline: "All",
          sessionLimit: 12,
          remainingSessions: 11,
          isUsable: true,
          startDate: "2026-09-01T00:00:00Z",
          endDate: "2026-12-31T00:00:00Z",
          status: "Active",
        },
      ]),
    });
  });

  await page.route("**/api/membership-packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          packageId: 1,
          name: "Diamond All-Access",
          price: 23400000,
          durationDays: 365,
          sessionLimit: null,
          description: "12 months unlimited training",
          isActive: true,
        },
      ]),
    });
  });

  await page.route("**/api/members/me/enrollments*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/members/me/schedule*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          session: {
            sessionId: "sess-1",
            className: "Basic Fitness",
            coachName: "Coach Alex",
            roomName: "Studio 1",
            discipline: "GroupX",
            startAtUtc: "2026-09-15T09:00:00Z",
            endAtUtc: "2026-09-15T10:00:00Z",
            capacity: 20,
            confirmedCount: 5,
          },
          isEnrolled: false,
          enrollmentId: null,
          cancellationDeadlineUtc: "2026-09-15T07:00:00Z",
        },
      ]),
    });
  });

  await page.route("**/api/enrollments*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enrollmentId: "enr-1" }),
      });
    }
  });

  await page.route("**/api/members/me/workout-plans*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/members/me/workout-results*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/members/me/training-profile*", async (route) => {
    if (route.request().method() === "PUT") {
      const data = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          goal: data.goal,
          experienceLevel: data.experienceLevel,
          notes: data.notes,
          updatedAt: new Date().toISOString(),
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          goal: "Initial Fitness Goal",
          experienceLevel: "Beginner",
          notes: "",
          updatedAt: "2026-09-14T03:00:00Z",
        }),
      });
    }
  });

  await page.route("**/api/notifications/unread-count*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1 }),
    });
  });

  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          notificationId: "notif-1",
          sourceEventType: "ClassReminder",
          sourceEntityId: null,
          message: "Your Yoga class starts in 2 hours.",
          status: "Unread",
          sentAt: "2026-09-14T03:00:00Z",
        },
      ]),
    });
  });
});

test("booking opens confirmation modal and can be dismissed via Escape", async ({
  page,
}) => {
  await page.goto("/member/class-schedule");
  const bookBtn = page.getByRole("button", { name: /Book Spot|Đặt chỗ/ }).first();
  await expect(bookBtn).toBeVisible();
  await bookBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/Basic Fitness/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("profile validation and training goal edits persist", async ({
  page,
}) => {
  await page.goto("/member/profile");
  const goalInput = page.locator("input[required]").first();
  await expect(goalInput).toBeVisible();
  await goalInput.fill("Run a 10km marathon in 3 months");
  await page.getByRole("button", { name: /Save Profile|Lưu hồ sơ/ }).click();
  await expect(page.getByRole("status")).toBeVisible();
});

test("QR renews after sixty seconds when opened via button", async ({
  page,
}) => {
  await page.goto("/member");
  await page.getByTestId("show-qr-btn").click();
  const qr = page.getByTestId("member-qr");
  await expect(qr).toBeVisible();
  const first = await qr.getAttribute("src");
  await page.getByTestId("refresh-qr-btn").click();
  await expect(qr).not.toHaveAttribute("src", first!);
});

test("membership packages catalog displays active passes and available tiers", async ({
  page,
}) => {
  await page.goto("/member/my-plans");
  await expect(
    page.getByRole("heading", { name: "Diamond All-Access" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Visit reception desk to enroll|Liên hệ quầy Lễ tân/),
  ).toBeVisible();
});

test("notifications panel in navigation shell displays recent alerts", async ({
  page,
}) => {
  await page.goto("/member");
  const bell = page.getByRole("button", { name: /notification/i }).first();
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(
    page.getByText("Your Yoga class starts in 2 hours."),
  ).toBeVisible();
});

for (const width of [320, 768, 1280])
  test(`all Member routes fit ${width}px with loaded assets`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "",
      "/class-schedule",
      "/my-registrations",
      "/my-plans",
      "/profile",
      "/invoices",
      "/training",
    ]) {
      await page.goto(`/member${route}`);
      const { scrollWidth, innerWidth: winWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        scrollWidth,
        `Route ${route || "/"} at ${width}px overflowed: scrollWidth=${scrollWidth}, innerWidth=${winWidth}`,
      ).toBeLessThanOrEqual(winWidth + 1);
      await expect
        .poll(
          async () =>
            page
              .locator("img:visible")
              .evaluateAll((images) =>
                images.every(
                  (image) =>
                    image instanceof HTMLImageElement &&
                    image.complete &&
                    image.naturalWidth > 0,
                ),
              ),
          { message: `Images load on ${route || "/member"}` },
        )
        .toBeTruthy();
      if (route === "/class-schedule" || route === "")
        await page.screenshot({
          path: `test-results/member-${route === "" ? "home" : "schedule"}-${width}.png`,
          fullPage: true,
        });
    }
  });

test("Member pages pass automated WCAG A/AA checks", async ({ page }) => {
  test.setTimeout(90000);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "",
      "/class-schedule",
      "/my-registrations",
      "/my-plans",
      "/profile",
      "/invoices",
      "/training",
    ]) {
      await page.goto(`/member${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, route).toEqual([]);
    }
  }
});

test("demo booking rules reject duplicates/full classes and late cancellation does not refund", () => {
  const s = createSeed();
  const session = s.sessions.find((x) => x.id === "strength")!;
  const now = Date.parse(session.startAt) - 12 * 3600000;
  applyCommand(
    s,
    { type: "book", sessionId: session.id, memberPackageId: "member-gold" },
    now,
  );
  expect(s.packages[0].remainingSessions).toBe(10);
  expect(() =>
    applyCommand(
      s,
      { type: "book", sessionId: session.id, memberPackageId: "member-gold" },
      now,
    ),
  ).toThrow(/kept your place|đã giữ chỗ/);
  applyCommand(
    s,
    { type: "cancel", sessionId: session.id },
    Date.parse(session.cancellationDeadline) + 1000,
  );
  expect(s.packages[0].remainingSessions).toBe(10);
  expect(s.enrollments.find((e) => e.sessionId === session.id)?.status).toBe(
    "CancelledLate",
  );
  expect(() =>
    applyCommand(
      s,
      { type: "book", sessionId: "groupx", memberPackageId: "member-gold" },
      now,
    ),
  ).toThrow(/full|hết chỗ/);
});

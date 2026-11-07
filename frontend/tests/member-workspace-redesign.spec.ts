import { expect, test, type Page } from "@playwright/test";

const session = {
  sessionId: "session-10",
  classId: 7,
  className: "Badminton Fundamentals",
  sportName: "Badminton",
  sessionNo: 5,
  roomId: 2,
  roomName: "Court 02",
  coachId: "coach-1",
  coachName: "Coach Alex",
  status: "SCHEDULED",
  startAtUtc: "2026-11-10T11:00:00Z",
  endAtUtc: "2026-11-10T12:30:00Z",
  attendanceStatus: null,
  isMakeup: false,
};
const enrollment = {
  classId: 7,
  enrollmentId: "enrollment-7",
  memberId: "member-1",
  classCode: "BAD-07",
  className: session.className,
  sportName: "Badminton",
  status: "CONFIRMED",
  classStatus: "IN_PROGRESS",
  numSessions: 12,
  completedSessions: 4,
  firstSessionStartUtc: "2026-10-27T11:00:00Z",
  lastSessionEndUtc: "2026-12-03T12:30:00Z",
  enrolledAt: "2026-10-20T08:00:00Z",
  endedAt: null,
  invoiceItemId: "invoice-item-7",
  coachId: "coach-1",
  coachName: "Coach Alex",
  roomName: "Court 02",
};
const profile = {
  memberId: "member-1",
  goal: "General fitness",
  goalType: "GENERAL_FITNESS",
  experienceLevel: "INTERMEDIATE",
  dateOfBirth: "1998-05-15",
  age: 28,
  sex: "FEMALE",
  heightCm: 170,
  weightKg: 65,
  targetWeightKg: null,
  bmi: 22.5,
  bmiCategory: "NORMAL",
  bodyBuild: "ATHLETIC",
  activityLevel: "MODERATELY_ACTIVE",
  trainingDaysPerWeek: 3,
  sessionMinutes: null,
  dietaryPreference: "NO_PREFERENCE",
  foodAllergies: null,
  notes: null,
  isComplete: true,
  updatedAt: "2026-11-06T08:00:00Z",
  recentMeasurements: [],
};

async function mockWorkspace(page: Page) {
  await page.clock.install({ time: new Date("2026-11-06T10:00:00Z") });
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let json: unknown = [];
    if (path === "/api/users/me")
      json = {
        userId: "member-1",
        email: "lan@example.com",
        fullName: "Lan Nguyen",
        role: "MEMBER",
        status: "ACTIVE",
        hasPassword: true,
        createdAt: "2026-09-01T08:00:00Z",
        sportIds: [],
      };
    else if (path === "/api/wallet/me")
      json = { availablePoints: 250, heldPoints: 0, vndPerPoint: 1000 };
    else if (path === "/api/notifications/unread-count") json = { count: 0 };
    else if (path === "/api/members/me/schedule") json = [session];
    else if (path === "/api/members/me/enrollments")
      json = { items: [enrollment], totalCount: 1 };
    else if (path === "/api/members/me/classes/7/sessions") json = [session];
    else if (path === "/api/members/me/classes/7/teaching-records")
      json = {
        items: [
          {
            recordId: "plan-1",
            classId: 7,
            sessionId: null,
            memberId: null,
            coachId: "coach-1",
            kind: "PLAN",
            title: "Serve and footwork",
            content: "Warm up for 10 minutes.\nPractice consistent low serves.",
            score: null,
            dueAtUtc: null,
            createdAtUtc: "2026-11-05T08:00:00Z",
            updatedAtUtc: "2026-11-05T08:00:00Z",
            version: 1,
          },
          {
            recordId: "result-1",
            classId: 7,
            sessionId: null,
            memberId: "member-1",
            coachId: "coach-1",
            kind: "RESULT",
            title: "Serving assessment",
            content: "More consistent placement; continue split-step practice.",
            score: 4,
            dueAtUtc: null,
            createdAtUtc: "2026-11-05T09:00:00Z",
            updatedAtUtc: "2026-11-05T09:00:00Z",
            version: 1,
          },
        ],
        totalCount: 2,
      };
    else if (path === "/api/coaches")
      json = [{ userId: "coach-1", fullName: "Coach Alex", avatarUrl: null }];
    else if (path === "/api/members/me/training-profile") json = profile;
    else if (path === "/api/ai/workout-suggestions/me") json = [];
    else if (
      path === "/api/members/me/invoices" ||
      path === "/api/members/me/gym-checkins"
    )
      json = { items: [], totalCount: 0 };
    else if (path === "/api/service-images") json = { items: [] };
    else if (path.startsWith("/api/service-images/"))
      json = {
        kind: "class",
        id: 7,
        version: "1",
        coverImageId: null,
        images: [],
      };
    return route.fulfill({ json });
  });
}

test("schedule deep link opens centered lesson details and preserves course access", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/member/schedule?date=2026-11-10&event=class%3Asession-10");
  const dialog = page.getByRole("dialog", {
    name: "Lesson details",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Badminton Fundamentals" }),
  ).toBeVisible();
  await expect(dialog.getByText("Coach Alex", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "View course", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/course=7/);
  await expect(
    page.getByRole("heading", { name: "Badminton Fundamentals", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to my schedule", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Month calendar" }),
  ).toBeVisible();
});

for (const width of [1440, 768, 320]) {
  test(`schedule uses the full calendar width and opens day activities in a dialog at ${width}px`, async ({
    page,
  }) => {
    await mockWorkspace(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/member/schedule?date=2026-11-10");
    const calendar = page.getByRole("group", { name: "Month calendar" });
    await expect(calendar).toBeVisible();
    await expect(page.getByRole("region", { name: "Day agenda" })).toHaveCount(
      0,
    );
    const contentWidth = await page.getByRole("main").evaluate((main) => {
      const style = getComputedStyle(main);
      return (
        main.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });
    const bounds = await calendar.boundingBox();
    expect(Math.abs(bounds!.width - contentWidth)).toBeLessThanOrEqual(2);
    if (width > 720) {
      const event = calendar
        .getByRole("button")
        .filter({ has: page.locator("time") })
        .first();
      const sticker = await event.locator("[data-sport]").boundingBox();
      const time = await event.locator("time").boundingBox();
      expect(sticker!.x + sticker!.width).toBeLessThanOrEqual(time!.x);
    }
    await calendar
      .getByRole("button", { name: "10/11/2026, 1 events", exact: true })
      .and(calendar.locator("[aria-pressed]"))
      .click();
    const day = page.getByRole("dialog", { name: "Tuesday, 10 November 2026" });
    await expect(day).toBeVisible();
    await day.getByRole("button", { name: /Badminton Fundamentals/ }).click();
    await expect(day).not.toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Lesson details", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await calendar
      .getByRole("button", { name: "11/11/2026, 0 events", exact: true })
      .and(calendar.locator("[aria-pressed]"))
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("No activities scheduled for this day."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("training filters retain coach scope and results stay read-only", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/member/training?tab=plans");
  await expect(
    page.getByRole("heading", { name: "Serve and footwork" }),
  ).toBeVisible();
  await expect(page.getByText("Entire class", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Scope", exact: true })
    .selectOption("personal");
  await expect(
    page.getByRole("heading", { name: "Serve and footwork" }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Results & progress" }).click();
  await expect(page).toHaveURL(/tab=results/);
  await expect(
    page.getByRole("heading", { name: "Serving assessment" }),
  ).toBeVisible();
  await expect(page.getByText("4/5", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /edit|publish/i })).toHaveCount(
    0,
  );
});

test("fitness form preserves save validation and fits a narrow viewport", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/member/training?tab=profile");
  await expect(
    page.getByRole("heading", { name: "Latest measurements" }),
  ).toBeVisible();
  await page
    .getByLabel("Main goal", { exact: false })
    .selectOption("ENDURANCE");
  await page
    .getByRole("spinbutton", { name: "Weight (kg)", exact: true })
    .fill("66");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByText("Please confirm before saving.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: /I confirm this information/ })
    .check();
  const write = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      request.url().includes("/api/members/me/training-profile"),
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  expect((await write).postDataJSON()).toMatchObject({
    goalType: "ENDURANCE",
    weightKg: 66,
    heightCm: 170,
    bodyBuild: "ATHLETIC",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
});

test.use({ viewport: { width: 1440, height: 900 } });
test.afterEach(async ({ page }, info) => {
  if (info.status === "passed") {
    await expect(page.locator("[data-startup-phase]")).toHaveAttribute(
      "data-startup-phase",
      "ready",
      { timeout: 15000 },
    );
    await page.screenshot({
      path: info.outputPath("verified-ui.png"),
      fullPage: true,
    });
  }
});

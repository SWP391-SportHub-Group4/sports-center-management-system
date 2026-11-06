import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/locales/en";

async function expectActionsAtBottom(dialog: ReturnType<Page["getByRole"]>) {
  const popup = await dialog.boundingBox();
  const actions = await dialog
    .locator("[data-class-edit-actions]")
    .boundingBox();
  expect(popup).not.toBeNull();
  expect(actions).not.toBeNull();
  expect(
    Math.abs(popup!.y + popup!.height - actions!.y - actions!.height),
  ).toBeLessThanOrEqual(2);
}

async function fixture(
  page: Page,
  options: {
    status?: string;
    empty?: boolean;
    conflict?: boolean;
    many?: boolean;
    confirmedCount?: number;
  } = {},
) {
  let changed = false;
  let conflicted = false;
  const writes: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "lead-coach-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path.endsWith("/lead-coach/candidates"))
      return route.fulfill({
        json: {
          version: 3,
          currentCoachId: "old-coach",
          remainingSessionCount: 3,
          coaches:
            options.empty || conflicted
              ? []
              : [
                  { coachId: "new-coach", fullName: "Jamie Tran" },
                  { coachId: "other-coach", fullName: "Taylor Nguyen" },
                  ...(options.many
                    ? Array.from({ length: 18 }, (_, index) => ({
                        coachId: `coach-${index}`,
                        fullName: `Coach ${index + 3}`,
                      }))
                    : []),
                ],
        },
      });
    if (path.endsWith("/lead-coach")) {
      writes.push(route.request().postDataJSON());
      if (options.conflict) {
        conflicted = true;
        return route.fulfill({
          status: 409,
          json: {
            error: "coach_busy",
            message: "This coach is no longer available. Choose another coach.",
          },
        });
      }
      changed = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/manager/classes/42")
      return route.fulfill({
        json: {
          classId: 42,
          code: "BD-042",
          name: "Badminton foundations",
          status: options.status ?? "PUBLISHED",
          sportId: 1,
          sportName: "Badminton",
          roomName: "Court A",
          defaultRoomId: 7,
          sessionMinutes: 60,
          scheduleRules: [
            { dayOfWeek: 1, startTimeLocal: "08:00" },
            { dayOfWeek: 3, startTimeLocal: "08:00" },
          ],
          coachId: changed ? "new-coach" : "old-coach",
          coachName: changed ? "Jamie Tran" : "Alex Nguyen",
          capacity: 20,
          confirmedCount: options.confirmedCount ?? 12,
          reservedCount: 12,
          activeHoldCount: 0,
          availableSeats: 8,
          price: 1200000,
          costAmount: 0,
          numSessions: 3,
          startDate: "2032-11-01",
          createdAt: "2026-10-01T01:00:00Z",
          publishedAt: "2026-10-02T01:00:00Z",
          version: changed ? 4 : 3,
          enrollmentOpen: true,
          thresholdStatus: "MET",
          breakEvenThreshold: 0,
        },
      });
    if (path === "/api/classes/42/sessions")
      return route.fulfill({
        json: [
          {
            sessionId: "session-42",
            sessionNo: 1,
            classId: 42,
            status: "SCHEDULED",
            roomName: "Court A",
            roomId: 7,
            coachId: changed ? "new-coach" : "old-coach",
            coachName: changed ? "Jamie Tran" : "Alex Nguyen",
            startAtUtc: "2032-11-01T01:00:00Z",
            endAtUtc: "2032-11-01T02:00:00Z",
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/classes/42?tab=sessions");
  return writes;
}

test("header pencil opens class settings and changes the lead coach in its tab", async ({
  page,
}) => {
  const writes = await fixture(page, { many: true });
  await expect(
    page.getByRole("button", { name: "Change Lead Coach", exact: true }),
  ).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Edit class", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Edit class", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog).not.toContainText("Badminton foundations · BD-042");
  await expect(
    dialog.getByRole("tab", { name: "Change Lead Coach" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    dialog.getByRole("tab", { name: "Weekly schedule" }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "Weekly schedule" }).click();
  await expect(
    dialog.getByText(
      "The weekly schedule can only be changed before students enroll.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Confirm change" }),
  ).toHaveCount(0);
  await dialog.getByRole("tab", { name: "Change Lead Coach" }).click();
  await dialog.getByRole("radio").first().check();
  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("New lead coach for remaining sessions");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const list = dialog
      .getByRole("group", { name: "Available coaches", exact: true })
      .locator("div")
      .first();
    await expect(list).toHaveCSS("scrollbar-width", "none");
    expect(
      await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await dialog.getByRole("radio").last().scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("radio").last()).toBeInViewport();
    await expect(
      dialog.getByRole("textbox", { name: "Reason for change" }),
    ).toBeInViewport();
    expect(
      await dialog
        .locator("form")
        .evaluate((element) => element.parentElement?.scrollTop),
    ).toBe(0);
    await expect(
      dialog.getByRole("tab", { name: "Weekly schedule" }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Confirm Change" }),
    ).toBeInViewport();
    await expectActionsAtBottom(dialog);
    await page.screenshot({
      path: `test-results/class-settings-coach-${width}.png`,
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "Confirm Change" }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    {
      coachId: "new-coach",
      expectedVersion: 3,
      reason: "New lead coach for remaining sessions",
    },
  ]);
  await expect(
    page.getByText("Jamie Tran", { exact: true }).first(),
  ).toBeVisible();
});

test("weekly schedule changes only after Yes and keeps edits after No or a conflict", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2032-10-01T02:00:00Z") });
  await fixture(page, { confirmedCount: 0 });
  await page.route("**/api/manager/court-schedule**", (route) =>
    route.fulfill({
      json: [
        {
          sourceType: "CLASS_SESSION",
          sourceId: "room-busy",
          title: "Room booking",
          roomId: 7,
          coachId: "another-coach",
          classId: 99,
          startAtUtc: "2032-11-02T04:00:00Z",
          endAtUtc: "2032-11-02T05:00:00Z",
          status: "SCHEDULED",
        },
        {
          sourceType: "COURT_RENTAL",
          sourceId: "adjacent-rental",
          title: "Adjacent court rental",
          roomId: 7,
          coachId: null,
          classId: null,
          startAtUtc: "2032-11-01T00:00:00Z",
          endAtUtc: "2032-11-01T01:00:00Z",
          status: "CONFIRMED",
        },
        {
          sourceType: "COURT_RENTAL",
          sourceId: "following-rental",
          title: "Following court rental",
          roomId: 7,
          coachId: null,
          classId: null,
          startAtUtc: "2032-11-01T02:00:00Z",
          endAtUtc: "2032-11-01T03:00:00Z",
          status: "CONFIRMED",
        },
        {
          sourceType: "CLASS_SESSION",
          sourceId: "coach-busy",
          title: "Coach booking elsewhere",
          roomId: 9,
          coachId: "old-coach",
          classId: 98,
          startAtUtc: "2032-11-02T06:00:00Z",
          endAtUtc: "2032-11-02T07:00:00Z",
          status: "SCHEDULED",
        },
        {
          sourceType: "CLASS_SESSION",
          sourceId: "unrelated",
          title: "Unrelated booking",
          roomId: 9,
          coachId: "another-coach",
          classId: 97,
          startAtUtc: "2032-11-02T08:00:00Z",
          endAtUtc: "2032-11-02T09:00:00Z",
          status: "SCHEDULED",
        },
        {
          sourceType: "COURT_RENTAL",
          sourceId: "cancelled",
          title: "Cancelled room booking",
          roomId: 7,
          startAtUtc: "2032-11-02T08:00:00Z",
          endAtUtc: "2032-11-02T09:00:00Z",
          status: "CANCELLED",
        },
      ],
    }),
  );
  await page.route("**/api/system-settings", (route) =>
    route.fulfill({
      json: [
        { key: "center.opening_minutes", value: "360" },
        { key: "center.closing_minutes", value: "1320" },
      ],
    }),
  );
  await page.route("**/api/rooms", (route) =>
    route.fulfill({
      json: [{ roomId: 7, name: "Court A", isActive: true, capacity: 20 }],
    }),
  );
  const writes: Record<string, unknown>[] = [];
  const checked: Record<string, unknown>[] = [];
  let failPreview = true;
  let releasePreview!: () => void;
  const previewGate = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  await page.route(
    "**/api/manager/classes/42/schedule/preview",
    async (route) => {
      checked.push(route.request().postDataJSON());
      if (failPreview) {
        failPreview = false;
        return route.fulfill({
          status: 409,
          json: {
            error: "schedule_conflict",
            message: "The new schedule conflicts with another booking.",
          },
        });
      }
      await previewGate;
      return route.fulfill({
        json: {
          version: 3,
          previewToken: `checked-${checked.length}`,
          sessions: [
            {
              sessionId: "session-42",
              sessionNo: 1,
              previousStartAtUtc: "2032-11-01T01:00:00Z",
              startAtUtc: "2032-11-02T01:00:00Z",
              endAtUtc: "2032-11-02T02:00:00Z",
            },
          ],
        },
      });
    },
  );
  await page.route("**/api/manager/classes/42/schedule", (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.getByRole("button", { name: "Edit class", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit class", exact: true });
  const coachBounds = await dialog.boundingBox();
  await dialog.getByRole("tab", { name: "Weekly schedule" }).click();
  const days = dialog.getByRole("combobox", { name: "Day", exact: true });
  await expect(days.first()).toBeVisible();
  await expect(dialog.getByText("Vietnam time", { exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByText(/remaining sessions/)).toHaveCount(0);
  const calendar = dialog.getByRole("region", {
    name: "Weekly timetable",
    exact: true,
  });
  await expect(
    calendar.getByRole("article", { name: "Room booking", exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByRole("article", {
      name: "Coach booking elsewhere",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    calendar.getByText("Unrelated booking", { exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByText("Cancelled room booking", { exact: true }),
  ).toHaveCount(0);
  const ruleList = dialog.getByRole("region", {
    name: "Weekly schedule rules",
    exact: true,
  });
  const proposed = calendar.getByRole("article", {
    name: "Proposed session 1",
    exact: true,
  });
  await expect(
    calendar.getByRole("article", {
      name: "Adjacent court rental",
      exact: true,
    }),
  ).toBeVisible();
  await expect(proposed).not.toHaveAttribute("data-conflict", "true");
  await dialog.getByLabel("Start", { exact: true }).first().fill("08:30");
  await expect(proposed).toHaveAttribute("data-conflict", "true");
  await dialog.getByLabel("Start", { exact: true }).first().fill("08:00");
  await expect(proposed).not.toHaveAttribute("data-conflict", "true");
  await expect(ruleList).toHaveCSS("scrollbar-width", "none");
  for (let index = 0; index < 8; index++)
    await ruleList.getByRole("button", { name: "Add", exact: true }).click();
  const calendarY = (await calendar.boundingBox())!.y;
  await ruleList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await ruleList.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(Math.round((await calendar.boundingBox())!.y)).toBe(
    Math.round(calendarY),
  );
  for (let index = 0; index < 8; index++)
    await ruleList
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return [Math.round(bounds?.width ?? 0), Math.round(bounds?.height ?? 0)];
    })
    .toEqual([
      Math.round(coachBounds?.width ?? 0),
      Math.round(coachBounds?.height ?? 0),
    ]);
  await days.nth(0).selectOption("2");
  await days.nth(1).selectOption("4");
  await expect(
    dialog.getByRole("button", { name: "Confirm change", exact: true }),
  ).toBeDisabled();
  const firstSessionInput = dialog.getByLabel("First remaining session", {
    exact: true,
  });
  await expect(firstSessionInput).toHaveAttribute("aria-invalid", "true");
  await expect(firstSessionInput.locator("..").getByRole("alert")).toHaveText(
    "Choose a date matching a selected weekday.",
  );
  await expect(
    dialog.getByText(
      "Choose valid weekdays and future times without overlapping sessions.",
    ),
  ).toHaveCount(0);
  await expect(
    dialog.getByLabel("First remaining session", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("First remaining session", { exact: true })
    .fill("2032-11-02");
  await expect(firstSessionInput).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByRole("button", { name: "Confirm change", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("textbox", { name: "Reason", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirm schedule change",
    exact: true,
  });
  await expect(confirmation).toContainText(
    "Are you sure you want to change the class schedule?",
  );
  const yes = confirmation.getByRole("button", { name: "Yes", exact: true });
  const no = confirmation.getByRole("button", { name: "No", exact: true });
  expect((await yes.boundingBox())!.x).toBeLessThan(
    (await no.boundingBox())!.x,
  );
  expect(checked).toHaveLength(0);
  expect(writes).toHaveLength(0);
  await no.click();
  await expect(confirmation).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(checked).toHaveLength(0);
  expect(writes).toHaveLength(0);
  await dialog.getByLabel("Start", { exact: true }).first().fill("09:00");
  await dialog
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await yes.click();
  await expect(confirmation).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveText(
    "The new schedule conflicts with another booking.",
  );
  await expect(dialog.getByLabel("Start", { exact: true }).first()).toHaveValue(
    "09:00",
  );
  expect(writes).toHaveLength(0);
  await expect(
    dialog.getByRole("region", { name: "New schedule preview", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("table")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      dialog.getByRole("tab", { name: "Weekly schedule" }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Confirm change", exact: true }),
    ).toBeInViewport();
    await expectActionsAtBottom(dialog);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/class-settings-${width}.png`,
      fullPage: true,
    });
  }
  await dialog
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/class-schedule-confirmation.png",
    fullPage: true,
  });
  await yes.click();
  await expect(yes).toBeDisabled();
  await expect(no).toBeDisabled();
  releasePreview();
  await expect(dialog).toHaveCount(0);
  expect(checked).toHaveLength(2);
  expect(writes).toEqual([
    {
      expectedVersion: 3,
      firstSessionDate: "2032-11-02",
      scheduleRules: [
        { dayOfWeek: 2, startTimeLocal: "09:00" },
        { dayOfWeek: 4, startTimeLocal: "08:00" },
      ],
      previewToken: "checked-2",
    },
  ]);
});

test("one class schedule log shows readable before and after values in details", async ({
  page,
}) => {
  await fixture(page);
  const previous = {
    name: "Badminton foundations",
    code: "BD-042",
    startDate: "2032-11-01",
    sessionMinutes: 120,
    remainingSessionCount: 7,
    scheduleRules: [
      { dayOfWeek: 1, startTimeLocal: "07:00" },
      { dayOfWeek: 3, startTimeLocal: "07:00" },
    ],
    sessions: [
      { sessionId: "old-session-id", startAtUtc: "2032-11-01T00:00:00Z" },
    ],
  };
  const updated = {
    ...previous,
    startDate: "2032-11-02",
    movedSessionCount: 7,
    scheduleRules: [
      { dayOfWeek: 2, startTimeLocal: "07:00" },
      { dayOfWeek: 4, startTimeLocal: "09:00" },
    ],
    sessions: [
      { sessionId: "new-session-id", startAtUtc: "2032-11-02T00:00:00Z" },
    ],
  };
  await page.route("**/api/audit-logs**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            auditId: "schedule-log",
            userId: "manager",
            actorEmail: "manager@example.com",
            timestamp: "2032-10-01T03:00:00Z",
            action: "CHANGE_CLASS_SCHEDULE",
            targetEntity: "Class",
            targetId: "42",
            oldValue: JSON.stringify(previous),
            newValue: JSON.stringify(updated),
            ipAddress: "127.0.0.1",
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
      },
    }),
  );
  await page.goto("/manager/classes/42?tab=history");
  await page
    .getByRole("button", { name: en.operations.details, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: en.courseHistory.CHANGE_CLASS_SCHEDULE,
    exact: true,
  });
  await expect(dialog).toContainText("manager@example.com");
  const before = dialog
    .getByRole("heading", { name: en.courseHistory.before, exact: true })
    .locator("..");
  const after = dialog
    .getByRole("heading", { name: en.courseHistory.after, exact: true })
    .locator("..");
  await expect(before).toContainText(
    `${en.operations.weekdays[1]} · 07:00–09:00`,
  );
  await expect(after).toContainText(
    `${en.operations.weekdays[2]} · 07:00–09:00`,
  );
  await expect(after).toContainText(
    `${en.operations.weekdays[4]} · 09:00–11:00`,
  );
  await expect(
    dialog.getByText("Sessions moved", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Remaining sessions", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(en.courseHistory.appliesFrom, { exact: true }),
  ).toHaveCount(2);
  await expect(dialog).not.toContainText("old-session-id");
  await expect(dialog).not.toContainText("new-session-id");
  await expect(
    dialog.getByText(en.courseHistory.reason, { exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/class-schedule-history-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("manager selects an eligible coach and refreshes class and sessions", async ({
  page,
}) => {
  const writes = await fixture(page, { status: "IN_PROGRESS" });
  await page.getByRole("button", { name: "Edit class", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit class" });
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
  await dialog
    .getByRole("searchbox", { name: "Search coaches by name" })
    .fill("Jamie");
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await dialog.getByRole("radio").check();
  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Cover the remaining class sessions");
  await page.screenshot({
    path: "test-results/lead-coach-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Confirm Change" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/lead-coach-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Confirm Change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel").getByText("Jamie Tran", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    {
      coachId: "new-coach",
      expectedVersion: 3,
      reason: "Cover the remaining class sessions",
    },
  ]);
});

test("empty candidates cannot submit; Escape restores button focus", async ({
  page,
}) => {
  await fixture(page, { empty: true });
  const trigger = page.getByRole("button", {
    name: "Edit class",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("heading", { name: "No eligible coaches available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("a new conflict refreshes candidates and prevents another stale submission", async ({
  page,
}) => {
  await fixture(page, { conflict: true });
  await page.getByRole("button", { name: "Edit class", exact: true }).click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Replace unavailable lead coach");
  await page.getByRole("button", { name: "Confirm Change" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "no longer available",
  );
  await expect(
    page.getByRole("heading", { name: "No eligible coaches available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
});

for (const status of ["DRAFT", "COMPLETED", "CANCELLED"]) {
  test(`change lead coach is hidden for ${status}`, async ({ page }) => {
    await fixture(page, { status });
    await expect(
      page.getByRole("heading", { name: "Badminton foundations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit class", exact: true }),
    ).toHaveCount(0);
  });
}

import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/locales/en";
import type { CourseSessionDto } from "../src/lib/types";

const original: CourseSessionDto = {
  sessionId: "original",
  classId: 42,
  className: "Badminton foundations",
  sessionNo: 3,
  roomId: 1,
  roomName: "Court A",
  coachId: "coach-a",
  coachName: "Alex Nguyen",
  startAtUtc: "2032-11-02T11:00:00Z",
  endAtUtc: "2032-11-02T12:30:00Z",
  status: "CANCELLED",
  isMakeup: false,
  rescheduledFromSessionId: null,
  incidentReport: {
    outcome: "NOT_HELD",
    occurredAtUtc: "2032-11-02T11:00:00Z",
    recordedAtUtc: "2032-11-02T11:05:00Z",
    reason: "Lighting failure on Court A",
    replacementSessionId: "makeup",
  },
};
const makeup: CourseSessionDto = {
  ...original,
  sessionId: "makeup",
  sessionNo: 11,
  startAtUtc: "2032-12-02T11:00:00Z",
  endAtUtc: "2032-12-02T12:30:00Z",
  roomId: 2,
  roomName: "Court B",
  status: "SCHEDULED",
  isMakeup: true,
  rescheduledFromSessionId: "original",
  incidentReport: null,
};
const next: CourseSessionDto = {
  ...original,
  sessionId: "next",
  sessionNo: 4,
  status: "SCHEDULED",
  startAtUtc: "2032-11-04T11:00:00Z",
  endAtUtc: "2032-11-04T12:30:00Z",
  incidentReport: null,
};

async function fixture(page: Page, sessions: CourseSessionDto[]) {
  const rosterRequests: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "makeup-manager-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/manager/classes/42")
      return route.fulfill({
        json: {
          classId: 42,
          code: "BD-042",
          name: "Badminton foundations",
          status: "PUBLISHED",
          sportId: 1,
          sportName: "Badminton",
          capacity: 20,
          confirmedCount: 12,
          activeHoldCount: 0,
          availableSeats: 8,
          price: 1200000,
          costAmount: 12000000,
          numSessions: 10,
          startDate: "2032-11-01",
          createdAt: "2026-10-01T01:00:00Z",
          roomName: "Court A",
          coachName: "Alex Nguyen",
          version: 1,
        },
      });
    if (path === "/api/classes/42/sessions")
      return route.fulfill({ json: sessions });
    if (path.endsWith("/roster")) {
      const id = path.split("/").at(-2)!;
      rosterRequests.push(id);
      return route.fulfill({
        json: {
          session: sessions.find((s) => s.sessionId === id),
          entries: [
            {
              enrollmentId: "enrollment-1",
              memberId: "member-1",
              memberName: "Linh Nguyen",
              enrollmentStatus: "CONFIRMED",
              attendanceStatus: id === "original" ? "ABSENT" : "PRESENT",
            },
          ],
        },
      });
    }
    if (path === "/api/manager/incidents")
      return route.fulfill({ json: { items: [], totalCount: 0 } });
    return route.fulfill({ json: [] });
  });
  return rosterRequests;
}

test("sessions pair the cancellation with its makeup and open each session's own attendance", async ({
  page,
}) => {
  const requests = await fixture(page, [makeup, next, original]);
  await page.goto("/manager/classes/42?tab=sessions");
  const sessions = page.getByRole("article");
  await expect(sessions).toHaveCount(3);
  await expect(sessions.locator("h3")).toHaveText([
    "Session #3",
    "Session #11",
    "Session #4",
  ]);
  const cancelled = page.getByRole("article", {
    name: "Session #3",
    exact: true,
  });
  const replacement = page.getByRole("article", {
    name: "Session #11",
    exact: true,
  });
  await expect(cancelled).toContainText("Makeup session #11");
  await expect(cancelled).toContainText("Lighting failure on Court A");
  await expect(cancelled).toContainText("02/12/2032");
  await expect(replacement).toContainText("Makeup for session #3");
  await expect(
    cancelled.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    replacement.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/makeup-sessions-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/makeup-sessions-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await replacement
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Attendance", exact: true });
  await expect(dialog).toContainText("Session #11");
  await expect(dialog).toContainText("Linh Nguyen");
  await expect(dialog).toContainText("Present");
  await expect(dialog).not.toContainText("Absent");
  expect([...new Set(requests)]).toEqual(["makeup"]);
  await page.screenshot({
    path: "test-results/makeup-attendance-mobile.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(
    replacement.getByRole("button", { name: "Attendance", exact: true }),
  ).toBeFocused();
  await cancelled
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  await expect(dialog).toContainText("Session #3");
  await expect(dialog).toContainText("Absent");
  expect([...new Set(requests)]).toEqual(["makeup", "original"]);
});

test("replacement chains and unavailable original sessions remain visible without duplicates", async ({
  page,
}) => {
  const second = {
    ...makeup,
    sessionId: "second",
    sessionNo: 12,
    rescheduledFromSessionId: "makeup",
  };
  const orphan = {
    ...makeup,
    sessionId: "orphan",
    sessionNo: 13,
    rescheduledFromSessionId: "unavailable",
  };
  await fixture(page, [
    second,
    orphan,
    next,
    { ...makeup, status: "CANCELLED" },
    original,
  ]);
  await page.goto("/manager/classes/42?tab=sessions");
  await expect(page.getByRole("article").locator("h3")).toHaveText([
    "Session #3",
    "Session #11",
    "Session #12",
    "Session #4",
    "Session #13",
  ]);
  await expect(
    page.getByRole("article", { name: "Session #12", exact: true }),
  ).toContainText("Makeup for session #11");
  await expect(
    page.getByRole("article", { name: "Session #13", exact: true }),
  ).toContainText("Makeup session");
});

test("incident schedule selections stay pending until the affected-activities Confirm", async ({
  page,
}, testInfo) => {
  await fixture(page, [original, makeup, next]);
  let handled = false;
  let available = false;
  let holds = 0;
  const scheduleRequests: URL[] = [];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/class-sessions/original")
      return route.fulfill({
        json: { ...original, status: "SCHEDULED", incidentReport: null },
      });
    if (path === "/api/rooms")
      return route.fulfill({
        json: [
          {
            roomId: 1,
            name: "Court A",
            roomTypeId: 1,
            capacity: 20,
            isActive: true,
          },
          { roomId: 2, name: "Court B", capacity: 20, isActive: true },
          { roomId: 3, name: "Court C", capacity: 20, isActive: true },
        ],
      });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [{ roomTypeId: 1, name: "Badminton", sportIds: [1] }],
      });
    if (path === "/api/coaches")
      return route.fulfill({
        json: [
          { userId: "coach-a", fullName: "Alex Nguyen" },
          { userId: "coach-b", fullName: "Linh Trần" },
        ],
      });
    if (path === "/api/manager/court-schedule") {
      const url = new URL(route.request().url());
      scheduleRequests.push(url);
      const startAtUtc = `${url.searchParams.get("fromDate")}T11:00:00Z`;
      const endAtUtc = `${url.searchParams.get("fromDate")}T12:30:00Z`;
      return route.fulfill({
        json: [
          {
            sourceType: "CLASS_SESSION",
            sourceId: "room-only",
            title: "Selected room activity",
            roomId: 1,
            coachId: "coach-c",
            startAtUtc,
            endAtUtc,
            status: "SCHEDULED",
          },
          {
            sourceType: "CLASS_SESSION",
            sourceId: "coach-only",
            title: "Selected coach activity",
            roomId: 3,
            coachId: "coach-a",
            startAtUtc,
            endAtUtc,
            status: "SCHEDULED",
          },
          {
            sourceType: "CLASS_SESSION",
            sourceId: "unrelated",
            title: "Other resources activity",
            roomId: 2,
            coachId: "coach-b",
            startAtUtc,
            endAtUtc,
            status: "SCHEDULED",
          },
          {
            sourceType: "CLASS_SESSION",
            sourceId: "original",
            title: "Original session excluded",
            roomId: 1,
            coachId: "coach-a",
            startAtUtc,
            endAtUtc,
            status: "SCHEDULED",
          },
        ],
      });
    }
    if (path === "/api/manager/class-schedule/availability")
      return route.fulfill({
        json: {
          available,
          roomName: "Court A",
          coachName: "Alex Nguyen",
          reasons: available ? [] : ["room_conflict"],
        },
      });
    if (path === "/api/manager/incidents/fences") {
      if (route.request().method() === "POST") holds++;
      return route.fulfill({
        json:
          route.request().method() === "GET"
            ? []
            : { fenceId: "incident-fence" },
      });
    }
    if (path === "/api/manager/incidents/resolve") {
      writes.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({
        json: { incidentId: "55555555-5555-4555-8555-555555555555" },
      });
    }
    if (path === "/api/manager/incidents/preview") {
      handled = (route.request().postDataJSON().resolutions?.length ?? 0) > 0;
      return route.fulfill({
        json: {
          canResolve: handled,
          members: [],
          impacts: [
            {
              sourceType: "CLASS_SESSION",
              sourceId: "original",
              startAtUtc: original.startAtUtc,
              endAtUtc: original.endAtUtc,
              resolutionOptions: [],
            },
          ],
        },
      });
    }
    if (
      route.request().method() === "POST" &&
      path.startsWith("/api/class-sessions/")
    ) {
      writes.push({ path, body: route.request().postDataJSON() });
      handled = true;
      return route.fulfill({ json: makeup });
    }
    return route.fallback();
  });
  const query = new URLSearchParams({
    scope: "ROOM",
    roomId: "1",
    start: "2032-11-02T18:00",
    end: "2032-11-02T19:30",
    reason: "Lighting failure on Court A",
  });
  await page.goto(`/manager/incidents?${query}`);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: en.incidentHistory.arrangeMakeup,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: en.incidentHistory.editSession,
    exact: true,
  });
  const calendar = dialog.getByRole("region", {
    name: en.classScheduleLookup.title,
    exact: true,
  });
  await expect(
    calendar.getByText("Selected room activity", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByText("Selected coach activity", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByText("Other resources activity", { exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByText("Original session excluded", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: en.operations.room, exact: true })
    .fill("court b");
  await expect(
    dialog.getByRole("option", { name: "Court B", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: en.operations.room, exact: true })
    .press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: en.operations.room, exact: true }),
  ).toHaveValue("Court B");
  await dialog
    .getByRole("combobox", { name: en.operations.coach, exact: true })
    .fill("linh tran");
  await expect(
    dialog.getByRole("option", { name: "Linh Trần", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: en.operations.coach, exact: true })
    .press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: en.operations.coach, exact: true }),
  ).toHaveValue("Linh Trần");
  await expect(
    calendar.getByText("Other resources activity", { exact: true }),
  ).toBeVisible();
  await expect(
    calendar.getByText("Selected room activity", { exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByText("Selected coach activity", { exact: true }),
  ).toHaveCount(0);
  await calendar
    .getByRole("button", { name: en.mSchedule.nextWeek, exact: true })
    .click();
  await expect
    .poll(() => scheduleRequests.at(-1)?.searchParams.get("fromDate"))
    .toBe("2032-11-08");
  await calendar
    .getByRole("button", { name: en.mSchedule.prevWeek, exact: true })
    .click();
  await expect
    .poll(() => scheduleRequests.at(-1)?.searchParams.get("fromDate"))
    .toBe("2032-11-01");
  await calendar
    .getByRole("button", { name: en.mSchedule.currentWeek, exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: en.operations.room, exact: true })
    .fill("court a");
  await expect(
    dialog.getByRole("option", { name: "Court A", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: en.operations.room, exact: true })
    .press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: en.operations.room, exact: true }),
  ).toHaveValue("Court A");
  await dialog
    .getByRole("combobox", { name: en.operations.coach, exact: true })
    .fill("alex");
  await expect(
    dialog.getByRole("option", { name: "Alex Nguyen", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: en.operations.coach, exact: true })
    .press("Enter");
  await expect(
    dialog.getByRole("combobox", { name: en.operations.coach, exact: true }),
  ).toHaveValue("Alex Nguyen");
  await expect(
    dialog.getByText(en.classSessions.incidentMakeupTitle, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(en.incidentPlans.hint, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(en.incidentHistory.makeupHint, { exact: true }),
  ).toHaveCount(0);
  const impacts = page.getByRole("dialog", {
    name: en.operations.impact,
    exact: true,
  });
  await expect(
    impacts.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeDisabled();
  await expect(
    impacts.getByRole("columnheader", {
      name: en.operations.room,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    impacts.getByText(en.incidentHistory.changesNeeded, { exact: true }),
  ).toHaveCount(0);
  await expect(
    impacts.getByText(en.incidentHistory.reviewHint, { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: en.operations.edit, exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("option", { name: en.operations.reschedule, exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel(en.classSessions.makeupStart, { exact: true })
    .fill("2032-12-02T18:00");
  await expect
    .poll(() => scheduleRequests.at(-1)?.searchParams.get("fromDate"))
    .toBe("2032-11-29");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`incident-session-schedule-${width}.png`),
      animations: "disabled",
    });
  }
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Lighting failure on Court A");
  await expect(
    dialog.getByRole("button", {
      name: en.managerOperations.reviewChange,
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(holds).toBe(0);
  available = true;
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(holds).toBe(0);
  expect(writes).toHaveLength(0);
  await impacts
    .getByRole("button", {
      name: en.incidentHistory.arrangeMakeup,
      exact: true,
    })
    .click();
  await expect(
    dialog.getByLabel(en.classSessions.makeupStart, { exact: true }),
  ).toHaveValue("2032-12-02T18:00");
  await expect(
    dialog.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("Lighting failure on Court A");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(writes).toHaveLength(0);
  await expect(
    impacts.getByText(en.incidentPlans.hint, { exact: true }),
  ).toHaveCount(0);
  await impacts
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].path).toBe("/api/manager/incidents/resolve");
  expect(writes[0].body.resolutions).toMatchObject([
    {
      sourceId: "original",
      action: "CANCEL_WITH_MAKEUP",
      startAtUtc: "2032-12-02T11:00:00.000Z",
      roomId: 1,
      coachId: "coach-a",
      reason: "Lighting failure on Court A",
    },
  ]);
  expect(holds).toBe(0);
});

for (const [activities, services] of [
  [0, 0],
  [1, 0],
  [0, 1],
]) {
  test(`incident Confirm requires no activities or services: ${activities}/${services}`, async ({
    page,
  }) => {
    await fixture(page, []);
    const resolved: unknown[] = [];
    await page.route("**/api/manager/incidents/preview", (route) =>
      route.fulfill({
        json: {
          ...route.request().postDataJSON(),
          canResolve: true,
          previewToken: "latest-preview",
          members: [],
          impacts: activities
            ? [
                {
                  sourceType: "CLASS_SESSION",
                  sourceId: "original",
                  startAtUtc: original.startAtUtc,
                  endAtUtc: original.endAtUtc,
                  resolutionOptions: [],
                },
              ]
            : [],
          refunds: services
            ? [
                {
                  sourceId: "rental",
                  sourceType: "COURT_RENTAL",
                  memberId: "member",
                  memberName: "Alex",
                  serviceName: "Court rental",
                  status: "Confirmed",
                  isPaid: true,
                  maximumRefundPoints: 100,
                  refundedPoints: 0,
                  suggestedRefundPoints: 100,
                  startAtUtc: original.startAtUtc,
                  endAtUtc: original.endAtUtc,
                },
              ]
            : [],
        },
      }),
    );
    await page.route("**/api/manager/incidents/resolve", (route) => {
      resolved.push(route.request().postDataJSON());
      return route.fulfill({
        json: { incidentId: "55555555-5555-4555-8555-555555555555" },
      });
    });
    await page.goto(
      "/manager/incidents?scope=ROOM&roomId=1&start=2032-11-02T18:00&end=2032-11-02T19:30&reason=Court%20repair",
    );
    await page
      .getByRole("button", { name: en.operations.review, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: en.operations.impact,
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: en.operations.confirm,
      exact: true,
    });
    await expect(
      dialog.getByText(en.incidentRefunds.changed, { exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", {
        name: en.managerOperations.recheck,
        exact: true,
      }),
    ).toHaveCount(0);
    if (activities || services) {
      await expect(confirm).toBeDisabled();
      expect(resolved).toHaveLength(0);
    } else {
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(
        page.getByRole("dialog", {
          name: en.incidentHistory.successTitle,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", {
          name: en.managerOperations.resolveReview,
          exact: true,
        }),
      ).toHaveCount(0);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        previewToken: "latest-preview",
        refunds: [],
      });
    }
  });
}

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

test("future incidents stage makeup and save it only with final incident confirmation", async ({
  page,
}) => {
  await fixture(page, [original, makeup, next]);
  let handled = false;
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
        ],
      });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [{ roomTypeId: 1, name: "Badminton", sportIds: [1] }],
      });
    if (path === "/api/coaches")
      return route.fulfill({
        json: [{ userId: "coach-a", fullName: "Alex Nguyen" }],
      });
    if (path === "/api/manager/class-schedule/availability")
      return route.fulfill({
        json: {
          available: true,
          roomName: "Court A",
          coachName: "Alex Nguyen",
          reasons: [],
        },
      });
    if (path === "/api/manager/incidents/fences")
      return route.fulfill({
        json:
          route.request().method() === "GET"
            ? []
            : { fenceId: "incident-fence" },
      });
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
          impacts: handled
            ? []
            : [
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
  await expect(dialog).toContainText(en.classSessions.incidentMakeupTitle);
  await expect(
    dialog.getByRole("combobox", { name: en.operations.edit, exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("option", { name: en.operations.reschedule, exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel(en.classSessions.makeupStart, { exact: true })
    .fill("2032-12-02T18:00");
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Lighting failure on Court A");
  await dialog
    .getByRole("button", {
      name: en.managerOperations.reviewChange,
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: en.managerOperations.recheck, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: en.managerOperations.finalResolve,
      exact: true,
    })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].path).toBe("/api/manager/incidents/resolve");
  expect(writes[0].body.resolutions).toMatchObject([
    {
      sourceId: "original",
      action: "CANCEL_WITH_MAKEUP",
      reason: "Lighting failure on Court A",
      startAtUtc: "2032-12-02T11:00:00.000Z",
      roomId: 1,
      coachId: "coach-a",
    },
  ]);
});

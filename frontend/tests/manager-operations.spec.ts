import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";
import { vi } from "../src/locales/vi";
import { previewSessions } from "../src/features/courses/preview";

const managerId = "11111111-1111-4111-8111-111111111111";
const coachId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const noticeId = "55555555-5555-4555-8555-555555555555";
const paged = (items: unknown[], totalCount = items.length) => ({
  items,
  page: 1,
  pageSize: 20,
  totalCount,
});
const sports = [
  {
    sportId: 3,
    code: "badminton",
    name: "Badminton",
    isActive: true,
    services: [
      {
        serviceType: "GROUP_COURSE",
        isEnabled: true,
        defaultSessionMinutes: 90,
        defaultMaxCapacity: 12,
        offeringId: 30,
      },
      { serviceType: "COURT_RENTAL", isEnabled: true, offeringId: 31 },
    ],
  },
  {
    sportId: 1,
    code: "gym",
    name: "Gym",
    isActive: true,
    services: [
      {
        serviceType: "PERSONAL_TRAINING",
        isEnabled: true,
        offeringId: 42,
        defaultSessionMinutes: null,
        defaultMaxCapacity: null,
      },
    ],
  },
];
const rooms = [
  { roomId: 7, name: "Court A", capacity: 16, roomTypeId: 3, isActive: true },
];
const course = {
  classId: 1,
  code: "BAD-01",
  name: "Badminton autumn",
  sportId: 3,
  sportName: "Badminton",
  coachId,
  coachName: "Coach Linh",
  defaultRoomId: 7,
  roomName: "Court A",
  startDate: "2030-10-03",
  numSessions: 2,
  capacity: 12,
  availableSeats: 2,
  price: 300000,
  costAmount: 1800000,
  status: "DRAFT",
  thresholdStatus: "NOT_EVALUATED",
  breakEvenThreshold: 6,
  thresholdDeadlineUtc: "2030-10-02T17:00:00Z",
  confirmedCount: 4,
  reservedCount: 6,
  activeHoldCount: 6,
  version: 1,
  createdAt: "2030-09-01T00:00:00Z",
  publishedAt: null,
  scheduleRules: [{ dayOfWeek: 4, startTimeLocal: "18:00" }],
};
const session = {
  sessionId,
  classId: 1,
  roomId: 7,
  roomName: "Court A",
  coachId,
  coachName: "Coach Linh",
  startAtUtc: "2030-10-03T11:00:00Z",
  endAtUtc: "2030-10-03T12:30:00Z",
  status: "SCHEDULED",
};
const schedule = [
  {
    ...session,
    sourceType: "CLASS_SESSION",
    sourceId: sessionId,
    title: "Badminton autumn",
    participants: [
      {
        memberId,
        memberName: "Member An",
        enrollmentId: noticeId,
        attendanceStatus: null,
      },
    ],
  },
  {
    sourceType: "COURT_RENTAL",
    sourceId: noticeId,
    roomId: 7,
    coachId: null,
    coachName: null,
    classId: null,
    title: "Rental by An",
    startAtUtc: "2030-10-03T13:00:00Z",
    endAtUtc: "2030-10-03T14:00:00Z",
    status: "CONFIRMED",
    memberId,
    memberName: "Member An",
    participants: [],
  },
];
const coach = {
  userId: coachId,
  email: "coach@example.com",
  fullName: "Coach Linh",
  phone: "0900000000",
  bio: "Internal coach",
  sportIds: [1, 3],
  status: "ACTIVE",
  createdAt: "2030-09-01T00:00:00Z",
};
const delivery = {
  total: 2,
  pending: 1,
  sending: 0,
  sent: 0,
  failed: 1,
  read: 0,
};

async function fixture(
  page: Page,
  language: "en" | "vi" = "en",
  role = "CENTER_MANAGER",
) {
  await page.addInitScript(
    ({ language }) => {
      localStorage.setItem(
        "sporthub.accessToken",
        "manager-operations-fixture",
      );
      localStorage.setItem("sporthub_lang", language);
    },
    { language },
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/users/me")
      return route.fulfill({
        json: {
          userId: managerId,
          fullName: "Manager",
          email: "manager@example.com",
          role,
          sportIds: [],
        },
      });
    if (p === "/api/notifications/unread-count")
      return route.fulfill({ json: { count: 0 } });
    if (p === "/api/notifications") return route.fulfill({ json: [] });
    if (p === "/api/sports" || p === "/api/manager/sports")
      return route.fulfill({ json: sports });
    if (p === "/api/rooms") return route.fulfill({ json: rooms });
    if (p === "/api/room-types")
      return route.fulfill({
        json: [{ roomTypeId: 3, name: "Indoor court", sportIds: [3] }],
      });
    if (p.endsWith("/opening-hours"))
      return route.fulfill({
        json: [
          { dayOfWeek: 4, openTimeLocal: "06:00", closeTimeLocal: "22:00" },
        ],
      });
    if (p === "/api/coaches") return route.fulfill({ json: [coach] });
    if (p === "/api/manager/coaches")
      return route.fulfill({ json: paged([coach]) });
    if (p === `/api/manager/coaches/${coachId}`)
      return route.fulfill({ json: coach });
    if (p.endsWith("/service-qualifications"))
      return route.fulfill({ json: { offeringIds: [] } });
    if (p === "/api/availability/rooms")
      return route.fulfill({ json: [{ roomId: 7 }] });
    if (p === "/api/availability/coaches")
      return route.fulfill({ json: [{ coachId }] });
    if (p === "/api/manager/class-schedule/availability")
      return route.fulfill({
        json: {
          available: true,
          reasons: [],
          roomName: "Court A",
          coachName: "Coach Linh",
        },
      });
    if (p === "/api/manager/classes")
      return route.fulfill({
        json: route.request().method() === "POST" ? course : paged([course]),
      });
    if (p === "/api/manager/classes/1") return route.fulfill({ json: course });
    if (p === "/api/classes/1/sessions")
      return route.fulfill({ json: [session] });
    if (
      p.startsWith("/api/manager/classes/1/") &&
      ["holds", "enrollments", "threshold-responses"].some((kind) =>
        p.endsWith(kind),
      )
    )
      return route.fulfill({ json: paged([]) });
    if (p === "/api/class-sessions/" + sessionId)
      return route.fulfill({ json: session });
    if (p === "/api/manager/court-schedule")
      return route.fulfill({ json: schedule });
    if (p === "/api/audit-logs")
      return route.fulfill({
        json: paged([
          {
            auditId: noticeId,
            userId: managerId,
            actorEmail: "manager@example.com",
            action: "CREATE_CLASS",
            targetEntity: "Class",
            targetId: "1",
            timestamp: "2030-09-01T00:00:00Z",
            oldValue: null,
            newValue: '{"status":"Draft"}',
          },
        ]),
      });
    if (p === "/api/manager/room-blocks") return route.fulfill({ json: [] });
    if (p === "/api/users")
      return route.fulfill({
        json: paged(
          url.searchParams.get("role") === "COACH"
            ? [coach]
            : [
                {
                  userId: memberId,
                  fullName: "Member An",
                  email: "an@example.com",
                  role: "MEMBER",
                  status: "ACTIVE",
                },
              ],
        ),
      });
    if (p === `/api/manager/notices/${noticeId}`)
      return route.fulfill({ json: { noticeId, delivery } });
    if (p === "/api/manager/incidents")
      return route.fulfill({ json: paged([]) });
    if (p === `/api/manager/incidents/${noticeId}`)
      return route.fulfill({
        json: {
          incident: {
            incidentId: noticeId,
            scope: "ROOM",
            roomName: "Court A",
            startAtUtc: "2030-10-03T11:00:00Z",
            endAtUtc: "2030-10-03T12:30:00Z",
            reason: "Court repair",
            createdAtUtc: "2030-09-01T00:00:00Z",
          },
          blockedRooms: ["Court A"],
          cancelledRentals: 1,
          delivery,
        },
      });
    if (p === "/api/refunds") return route.fulfill({ json: paged([]) });
    if (p.includes("pt-") && p.endsWith("change-requests"))
      return route.fulfill({ json: [] });
    if (p === "/api/reports/revenue")
      return route.fulfill({
        json: {
          totalCollected: 100000,
          pointsRedeemedVnd: 200000,
          pointsIssued: 25,
          outstandingPoints: 525,
        },
      });
    if (p === "/api/reports/membership-period")
      return route.fulfill({
        json: { newMembers: 2, activeMembersAtPeriodEnd: 7 },
      });
    if (p === "/api/reports/class-enrollment")
      return route.fulfill({
        json: {
          totalClasses: 1,
          totalCapacity: 12,
          totalConfirmed: 4,
          totalActiveHolds: 6,
          fillRatio: 1 / 3,
          classes: [],
        },
      });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: p },
    });
  });
}
async function attentionFixture(page: Page) {
  await page.route("**/api/manager/classes?**", (route) =>
    route.fulfill({
      json: paged(
        [
          {
            ...course,
            status: "PUBLISHED",
            thresholdStatus: "AT_RISK",
            firstSessionStartUtc: "2030-10-03T11:00:00Z",
          },
        ],
        27,
      ),
    }),
  );
  await page.route("**/api/refunds?**", (route) =>
    route.fulfill({
      json: paged([
        {
          adjustmentId: noticeId,
          invoiceId: sessionId,
          invoiceNumber: "INV-2030-000012",
          requestedByName: "Receptionist Lan",
          requestedByUserId: managerId,
          status: "REQUESTED",
          systemCalculatedPoints: 600,
          approvedPoints: 0,
          amount: 0,
          requestedAmount: 999999,
          reason: "Unable to attend the course",
          createdAt: "2030-10-01T03:00:00Z",
        },
      ]),
    }),
  );
  await page.route("**/api/manager/pt-coach-change-requests?**", (route) =>
    route.fulfill({
      json: [
        {
          requestId: noticeId,
          memberId,
          memberName: "Member Bao",
          status: "PENDING",
          currentCoachName: "Coach Linh",
          requestedCoachName: "Coach Mai",
          reason: "Prefer a morning coach",
          requestedAt: "2030-10-01T03:00:00Z",
        },
      ],
    }),
  );
  await page.route("**/api/manager/pt-session-change-requests?**", (route) =>
    route.fulfill({
      json: [
        {
          requestId: sessionId,
          memberId,
          status: "PENDING",
          requestType: "RESCHEDULE",
          sessionStartAtUtc: "2030-10-03T11:00:00Z",
          requestedStartAtUtc: "2030-10-04T11:00:00Z",
          requestedAt: "2030-10-02T03:00:00Z",
          reason: "Change my training time",
          requestsException: true,
        },
      ],
    }),
  );
  await page.route(`**/api/users/${memberId}`, (route) =>
    route.fulfill({ json: { fullName: "Member An", email: "an@example.com" } }),
  );
}

for (const language of ["en", "vi"] as const) {
  for (const width of [1440, 390]) {
    test(`${language === "vi" ? "Vietnamese copy " : ""}Needs attention keeps a compact actionable preview at ${width}px`, async ({
      page,
    }) => {
      const t = language === "vi" ? vi : en;
      const m = t.managerOperations;
      await attentionFixture(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/manager");
      const classes = page.getByRole("region", { name: m.atRisk, exact: true });
      await expect(classes).toContainText("27");
      await expect(
        classes.getByText(m.confirmedStudents, { exact: true }).locator("+ dd"),
      ).toHaveText("4");
      await expect(
        classes.getByText(m.requiredStudents, { exact: true }).locator("+ dd"),
      ).toHaveText("6");
      await expect(classes).not.toContainText("Court A");
      await expect(classes).toContainText("03/10/2030, 18:00");
      const refunds = page.getByRole("region", {
        name: m.refunds,
        exact: true,
      });
      await expect(refunds).toContainText("Receptionist Lan");
      await expect(refunds).not.toContainText("Unable to attend the course");
      await expect(
        refunds
          .getByText(t.staffWork.systemCap, { exact: true })
          .locator("+ dd"),
      ).toContainText("600");
      await expect(refunds).not.toContainText("999,999");
      await expect(
        refunds.getByRole("link", { name: m.reviewRefunds, exact: true }),
      ).toHaveAttribute("href", "/manager/finance?tab=refunds");
      const pt = page.getByRole("region", { name: m.requests, exact: true });
      await expect(pt).toContainText("Member An");
      await expect(pt).toContainText(m.reschedulePtSession);
      await expect(pt).toContainText(m.changeCoach);
      await expect(pt).not.toContainText("Coach Mai");
      await expect(pt).not.toContainText("Prefer a morning coach");
      await expect(pt).not.toContainText("Change my training time");
      await expect(pt).toContainText(t.staffWork.exception);
      expect(await pt.locator("li").first().innerText()).toContain("Member An");
      expect(await page.locator("main").innerText()).not.toMatch(
        /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await pt.getByRole("link", { name: "Member Bao", exact: true }).click();
      await expect(
        page.getByRole("button", {
          name: t.staffWork.coachChanges,
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  }
}

test("Needs attention handles empty queues and independent refund recovery", async ({
  page,
}) => {
  await page.route("**/api/manager/classes?**", (route) =>
    route.fulfill({ json: paged([]) }),
  );
  let failRefunds = false;
  await page.route("**/api/refunds?**", (route) =>
    route.fulfill(
      failRefunds
        ? {
            status: 503,
            json: {
              code: "temporarily_unavailable",
              message: "Refund queue temporarily unavailable",
            },
          }
        : { json: paged([]) },
    ),
  );
  await page.goto("/manager");
  const m = en.managerOperations;
  await expect(page.getByText(m.noAtRisk, { exact: true })).toBeVisible();
  await expect(page.getByText(m.noRefunds, { exact: true })).toBeVisible();
  await expect(page.getByText(m.noPtRequests, { exact: true })).toBeVisible();
  failRefunds = true;
  await page
    .getByRole("button", { name: en.operations.refresh, exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Refund queue temporarily unavailable",
  );
  await expect(page.getByText(m.noAtRisk, { exact: true })).toBeVisible();
  failRefunds = false;
  await page
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(page.getByText(m.noRefunds, { exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("Needs attention does not present a PT preview as an exact total", async ({
  page,
}) => {
  await page.route("**/api/manager/pt-coach-change-requests?**", (route) =>
    route.fulfill({
      json: Array.from({ length: 6 }, (_, i) => ({
        requestId: String(i),
        memberId,
        memberName: `Member ${i}`,
        requestedAt: `2030-10-0${i + 1}T03:00:00Z`,
        currentCoachName: "Coach Linh",
        requestedCoachName: "Coach Mai",
        status: "PENDING",
      })),
    }),
  );
  await page.goto("/manager");
  const pt = page.getByRole("region", {
    name: en.managerOperations.requests,
    exact: true,
  });
  await expect(pt).toContainText("5+");
  await expect(pt.locator("li")).toHaveCount(5);
  await expect(pt.locator("li").first()).toContainText("Member 5");
});

test.beforeEach(async ({ page }, info) =>
  fixture(
    page,
    info.title.startsWith("Vietnamese copy") ? "vi" : "en",
    info.title.startsWith("Member cannot") ? "MEMBER" : "CENTER_MANAGER",
  ),
);
async function fillDraft(page: Page) {
  await page.goto("/manager/classes/new");
  await page.getByLabel(en.operations.code, { exact: true }).fill("TEST-NEW");
  await page
    .getByLabel(en.operations.name, { exact: true })
    .fill("New badminton course");
  await page.getByLabel(en.operations.sport, { exact: true }).selectOption("3");
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await page
    .getByLabel(en.operations.coach, { exact: true })
    .selectOption(coachId);
  await page.getByLabel(en.operations.room, { exact: true }).selectOption("7");
  await page.getByLabel(en.operations.numSessions, { exact: true }).fill("2");
  await page
    .getByLabel(en.operations.startDate, { exact: true })
    .fill("2030-10-03");
  await page.getByLabel(en.operations.day, { exact: true }).selectOption("4");
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
}

test("class filters survive reload and reset pagination", async ({ page }) => {
  await page.goto("/manager/classes?page=3");
  await page
    .getByLabel(en.operations.status, { exact: true })
    .selectOption("PUBLISHED");
  await page
    .getByLabel(en.operations.thresholdFilter, { exact: true })
    .selectOption("AT_RISK");
  await expect(page).toHaveURL(/status=PUBLISHED/);
  await expect(page).toHaveURL(/thresholdStatus=AT_RISK/);
  await expect(page).not.toHaveURL(/page=3/);
  await page.reload();
  await expect(
    page.getByLabel(en.operations.thresholdFilter, { exact: true }),
  ).toHaveValue("AT_RISK");
  await expect(page.getByText(en.managerOperations.holdHint)).toBeVisible();
});
test("draft save is separate from publish and reviews every generated session", async ({
  page,
}) => {
  let creates = 0,
    publishes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/publish")) publishes++;
  });
  await page.route("**/api/manager/classes", async (route) => {
    creates++;
    expect(route.request().postDataJSON()).toMatchObject({
      code: "TEST-NEW",
      sportId: 3,
      defaultRoomId: 7,
      numSessions: 2,
      coachId,
    });
    await route.fulfill({ json: course });
  });
  await fillDraft(page);
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3);
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft })
    .click();
  await expect(page).toHaveURL(/\/manager\/classes\/1$/);
  expect(creates).toBe(1);
  expect(publishes).toBe(0);
});
test("threshold and capacity guards stop invalid drafts", async ({ page }) => {
  await fillDraft(page);
  await page.getByLabel(en.operations.cost, { exact: true }).fill("3900000");
  await expect(
    page.getByText(en.managerOperations.thresholdExceeded),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.operations.next, exact: true }),
  ).toBeDisabled();
  await page.getByLabel(en.operations.cost, { exact: true }).fill("0");
  await page.getByLabel(en.operations.capacity, { exact: true }).fill("17");
  await expect(
    page.getByText(en.managerOperations.capacityExceeded),
  ).toBeVisible();
});
test("unsaved draft restores per account after reload", async ({ page }) => {
  await page.goto("/manager/classes/new");
  await page
    .getByLabel(en.operations.name, { exact: true })
    .fill("Keep my input");
  await page.reload();
  await expect(
    page.getByLabel(en.operations.name, { exact: true }),
  ).toHaveValue("Keep my input");
  await expect(
    page.getByText(en.managerOperations.draftRecovered),
  ).toBeVisible();
});
test("server save conflict preserves input for editing", async ({ page }) => {
  await page.route("**/api/manager/classes", (route) =>
    route.fulfill({
      status: 409,
      json: { code: "class_code_taken", message: "Duplicate class code" },
    }),
  );
  await fillDraft(page);
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft })
    .click();
  await expect(page.getByText("Duplicate class code")).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: en.operations.previous, exact: true })
      .click();
  await expect(
    page.getByLabel(en.operations.name, { exact: true }),
  ).toHaveValue("New badminton course");
});
test("detail tabs deep-link and load only the selected operational dataset", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (/\/(holds|enrollments|threshold-responses)$/.test(p)) reads.push(p);
  });
  await page.goto("/manager/classes/1?tab=holds");
  await expect(
    page.getByRole("tab", { name: en.managerOperations.holdsTab, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect([...new Set(reads)]).toEqual(["/api/manager/classes/1/holds"]);
  await page
    .getByRole("tab", { name: en.managerOperations.studentsTab, exact: true })
    .click();
  await expect(page).toHaveURL(/tab=students/);
  await page.reload();
  await expect(
    page.getByRole("tab", {
      name: en.managerOperations.studentsTab,
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
});
test("class history scopes audit query by entity and target ID", async ({
  page,
}) => {
  const response = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/audit-logs",
  );
  await page.goto("/manager/classes/1?tab=history");
  const url = new URL((await response).url());
  expect(url.searchParams.get("targetEntity")).toBe("Class");
  expect(url.searchParams.get("targetId")).toBe("1");
  await expect(
    page.getByRole("cell", { name: en.courseHistory.CREATE_CLASS }),
  ).toBeVisible();
});
test("publish is blocked by room conflict", async ({ page }) => {
  await page.route("**/api/manager/class-schedule/availability?**", (route) =>
    route.fulfill({
      json: {
        available: false,
        reasons: ["room_busy"],
        roomName: "Court A",
        coachName: "Coach Linh",
      },
    }),
  );
  await page.goto("/manager/classes/1");
  await page
    .getByRole("button", { name: en.operations.publish, exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("cell", { name: new RegExp(en.operations.conflict) }),
  ).toHaveCount(2);
});

test("publish confirms once and refreshes the server lifecycle", async ({
  page,
}) => {
  let published = false,
    writes = 0;
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: { ...course, status: published ? "PUBLISHED" : "DRAFT" },
    }),
  );
  await page.route("**/api/manager/classes/1/publish", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      expectedVersion: course.version,
    });
    writes++;
    published = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/manager/classes/1");
  await page
    .getByRole("button", { name: en.operations.publish, exact: true })
    .click();
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true });
  await expect(confirm).toBeEnabled();
  expect(writes).toBe(0);
  await confirm.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: en.operations.publish, exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
});
test("session change is reviewed and rejected form stays intact", async ({
  page,
}) => {
  let changes = 0;
  await page.route(`**/api/class-sessions/${sessionId}/reschedule`, (route) => {
    changes++;
    return route.fulfill({
      status: 409,
      json: { code: "schedule_conflict", message: "Room is already occupied" },
    });
  });
  await page.goto("/manager/classes/1?tab=sessions");
  await page
    .getByRole("row")
    .filter({ hasText: "Court A" })
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Move to next week");
  await dialog
    .getByRole("button", { name: en.managerOperations.reviewChange })
    .click();
  expect(changes).toBe(0);
  await expect(
    dialog.getByText(en.managerOperations.oldSchedule, { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog.getByText("Room is already occupied")).toBeVisible();
  await dialog
    .getByRole("button", { name: en.managerOperations.editReview })
    .click();
  await expect(
    dialog.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("Move to next week");
  expect(changes).toBe(1);
});
test("session preview names resources, excludes itself and blocks unavailable changes", async ({
  page,
}) => {
  let available = false;
  let writes = 0;
  await page.route("**/api/manager/class-schedule/availability?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("excludeSessionId")).toBe(sessionId);
    expect(query.get("capacity")).toBe("12");
    return route.fulfill({
      json: {
        available,
        roomName: "Court A",
        coachName: "Coach Linh",
        reasons: available ? [] : ["outside_opening_hours", "coach_busy"],
      },
    });
  });
  await page.route(`**/api/class-sessions/${sessionId}/reschedule`, (route) => {
    writes++;
    return route.fulfill({ json: session });
  });
  await page.goto("/manager/classes/1?tab=sessions");
  await page
    .getByRole("row")
    .filter({ hasText: "Court A" })
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Move to next week");
  await dialog
    .getByRole("button", { name: en.managerOperations.reviewChange })
    .click();
  await expect(
    dialog.getByText(
      en.managerOperations.availabilityReasons.outside_opening_hours,
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(en.managerOperations.availabilityReasons.coach_busy),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText(
      new RegExp(`${en.managerOperations.newSchedule}.*Court A.*Coach Linh`),
    ),
  ).toBeVisible();
  expect(writes).toBe(0);
  available = true;
  await dialog
    .getByRole("button", { name: en.operations.refresh, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);
});

test("failed session availability never enables confirmation and retry keeps the reason", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/manager/class-schedule/availability?**", (route) =>
    route.fulfill(
      failed
        ? {
            status: 503,
            json: {
              code: "preview_unavailable",
              message: "Preview temporarily unavailable",
            },
          }
        : {
            json: {
              available: true,
              roomName: "Court A",
              coachName: "Coach Linh",
              reasons: [],
            },
          },
    ),
  );
  await page.goto("/manager/classes/1?tab=sessions");
  await page
    .getByRole("row")
    .filter({ hasText: "Court A" })
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Keep this reason");
  await dialog
    .getByRole("button", { name: en.managerOperations.reviewChange })
    .click();
  await expect(
    dialog.getByText("Preview temporarily unavailable"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toHaveCount(0);
  failed = false;
  await dialog
    .getByRole("button", { name: en.operations.refresh, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeEnabled();
  await expect(dialog.getByText("Reschedule · Keep this reason")).toBeVisible();
});

test("threshold keeps supported refund and transfer responses without an unavailable next-course option", async ({
  page,
}) => {
  await page.route("**/api/manager/classes/1/threshold-responses?**", (route) =>
    route.fulfill({
      json: paged([
        {
          responseId: "refund",
          memberName: "Member refunded",
          choice: "REFUND",
          resolutionStatus: "COMPLETED",
        },
        {
          responseId: "transfer",
          memberName: "Member transferring",
          choice: "TRANSFER",
          resolutionStatus: "AWAITING_PAYMENT",
        },
      ]),
    }),
  );
  await page.goto("/manager/classes/1?tab=threshold");
  await expect(page.getByText(en.managerOperations.interestGap)).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Member refunded" }),
  ).toContainText(en.wireStatus.REFUND);
  await expect(
    page.getByRole("row").filter({ hasText: "Member transferring" }),
  ).toContainText(en.wireStatus.TRANSFER);
  await expect(
    page.getByRole("button", { name: /Wait.*next|Chờ.*sau/i }),
  ).toHaveCount(0);
});

test("schedule URL keeps day, room and activity filter through reload", async ({
  page,
}) => {
  await page.goto(
    "/manager/schedule?date=2030-10-03&view=list&roomId=7&sourceType=COURT_RENTAL",
  );
  await expect(
    page.getByRole("button", { name: /Rental by An/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Class session.*Badminton autumn/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByLabel(en.operations.room, { exact: true }),
  ).toHaveValue("7");
  await expect(page.getByLabel(en.managerOperations.source)).toHaveValue(
    "COURT_RENTAL",
  );
});
test("schedule keeps its context without an unavailable AI action", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", (r) => {
    if (
      ["POST", "PUT", "DELETE"].includes(r.method()) &&
      new URL(r.url()).pathname.startsWith("/api/")
    )
      writes++;
  });
  await page.goto("/manager/schedule?date=2030-10-03&view=day&roomId=7");
  await expect(
    page.getByRole("button", { name: en.managerOperations.aiTitle }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/roomId=7/);
  expect(writes).toBe(0);
});
test("qualification maps the server offering ID and keeps rejected draft", async ({
  page,
}) => {
  let ids: unknown;
  await page.route(
    `**/api/manager/coaches/${coachId}/service-qualifications`,
    (route) => {
      if (route.request().method() === "PUT") {
        ids = route.request().postDataJSON();
        return route.fulfill({
          status: 409,
          json: {
            code: "qualification_in_use",
            message: "PT qualification is in use",
          },
        });
      }
      return route.fulfill({ json: { offeringIds: [] } });
    },
  );
  await page.goto(`/manager/coaches/${coachId}?tab=qualification`);
  await page.getByRole("checkbox", { name: "Gym · PT" }).check();
  await page
    .getByRole("button", { name: en.operations.save, exact: true })
    .click();
  await expect(page.getByText("PT qualification is in use")).toBeVisible();
  expect(ids).toEqual({ offeringIds: [42] });
  await expect(page.getByRole("checkbox", { name: "Gym · PT" })).toBeChecked();
});
test("facility details reload with opening hours and incident entry", async ({
  page,
}) => {
  await page.goto("/manager/facilities/7");
  await expect(
    page.getByRole("heading", { name: "Court A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: en.operations.incidents, exact: true }),
  ).toHaveAttribute("href", /roomId=7/);
  await page.reload();
  await expect(page.getByText(en.managerOperations.openingHint)).toBeVisible();
});
const historyIncident = {
  incidentId: noticeId,
  scope: "ROOM",
  roomName: "Court A",
  startAtUtc: "2030-10-03T11:00:00Z",
  endAtUtc: "2030-10-03T12:30:00Z",
  reason: "Repair court lighting",
  createdAtUtc: "2030-09-01T00:00:00Z",
};

test("incident history pages by readable information and opens details without an ID lookup", async ({
  page,
}) => {
  const requests: number[] = [];
  await page.route("**/api/manager/incidents?**", (route) => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    requests.push(pageNumber);
    return route.fulfill({
      json: {
        ...paged(
          [
            {
              ...historyIncident,
              reason: pageNumber === 1 ? historyIncident.reason : "Water leak",
            },
          ],
          21,
        ),
        page: pageNumber,
      },
    });
  });
  await page.goto("/manager/incidents");
  await expect(
    page.getByText(historyIncident.reason, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.managerOperations.receiptId, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(noticeId, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: en.wallet.previous, exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: en.wallet.next, exact: true }).click();
  await expect(page.getByText("Water leak", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.wallet.next, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", {
      name: `${en.operations.details}: Water leak`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: en.incidentHistory.details,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(en.incidentHistory.cancelledRentals.replace("{count}", "1")),
  ).toBeVisible();
  expect(requests).toEqual([1, 2]);
});

test("incident detail summarizes delivery and refreshing never writes or calls the removed API", async ({
  page,
}) => {
  let reads = 0;
  const writes: string[] = [];
  const oldRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/")) return;
    if (!["GET", "OPTIONS"].includes(request.method()))
      writes.push(request.url());
    if (request.url().includes(`/incidents/${noticeId}/notifications`))
      oldRequests.push(request.url());
  });
  await page.route(`**/api/manager/incidents/${noticeId}`, (route) => {
    reads++;
    return route.fulfill({
      json: {
        incident: historyIncident,
        blockedRooms: ["Court A"],
        cancelledRentals: 1,
        delivery:
          reads === 1
            ? { total: 2, pending: 0, sending: 0, sent: 1, failed: 1, read: 0 }
            : { total: 2, pending: 0, sending: 0, sent: 1, failed: 0, read: 1 },
      },
    });
  });
  await page.goto(`/manager/incidents/${noticeId}`);
  await expect(
    page.getByText(en.incidentHistory.deliveryFailed.replace("{count}", "1")),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText(noticeId, { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: en.operations.refresh, exact: true })
    .click();
  await expect(
    page.getByText(en.incidentHistory.deliverySent, { exact: true }),
  ).toBeVisible();
  expect(reads).toBe(2);
  expect(writes).toEqual([]);
  expect(oldRequests).toEqual([]);
});

test("incident history handles empty and failed requests with recovery", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/manager/incidents?**", (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 503,
          json: {
            code: "unavailable",
            message: "Incident history temporarily unavailable",
          },
        })
      : route.fulfill({ json: paged([]) });
  });
  await page.goto("/manager/incidents");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Incident history temporarily unavailable" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(page.getByText(en.incidentHistory.empty)).toBeVisible();
  await page
    .getByRole("link", { name: en.incidentHistory.create, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toBeVisible();
});

test("resolved incident keeps its delivery summary after reload and starts a fresh form without repeating resolution", async ({
  page,
}) => {
  let resolves = 0;
  await page.route(`**/api/manager/incidents/${noticeId}`, (route) =>
    route.fulfill({
      json: {
        incident: historyIncident,
        blockedRooms: ["Court A"],
        cancelledRentals: 1,
        delivery: {
          total: 2,
          pending: 2,
          sending: 0,
          sent: 0,
          failed: 0,
          read: 0,
        },
      },
    }),
  );
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        scope: "ROOM",
        roomId: 7,
        canResolve: true,
        blockReason: null,
        impacts: [],
      },
    }),
  );
  await page.route("**/api/manager/incidents/resolve", (route) => {
    resolves++;
    return route.fulfill({ json: { incidentId: noticeId } });
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.recheck, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: en.managerOperations.finalResolve,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(en.incidentHistory.deliverySending, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText(en.incidentHistory.deliverySending, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.create, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("");
  await expect(page).toHaveURL(/create=1/);
  expect(resolves).toBe(1);
});

async function incidentInputs(page: Page) {
  await page.goto("/manager/incidents?roomId=7");
  const start = page.getByRole("group", {
    name: en.operations.start,
    exact: true,
  });
  const end = page.getByRole("group", { name: en.operations.end, exact: true });
  await start
    .getByLabel(en.operations.date, { exact: true })
    .fill("2030-10-03");
  await start
    .getByLabel(en.incidentHistory.time24, { exact: true })
    .fill("18:00");
  await end.getByLabel(en.operations.date, { exact: true }).fill("2030-10-03");
  await end
    .getByLabel(en.incidentHistory.time24, { exact: true })
    .fill("21:00");
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Water leak");
}

test("incident uses 24-hour input, validates the range and preserves Vietnam time in preview", async ({
  page,
}) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/manager/incidents/preview", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        scope: "ROOM",
        roomId: 7,
        impacts: [],
        canResolve: true,
        blockReason: null,
      },
    });
  });
  await incidentInputs(page);
  const start = page.getByRole("group", {
    name: en.operations.start,
    exact: true,
  });
  const end = page.getByRole("group", { name: en.operations.end, exact: true });
  const review = page.getByRole("button", {
    name: en.operations.review,
    exact: true,
  });
  await start
    .getByLabel(en.incidentHistory.time24, { exact: true })
    .fill("24:00");
  await start.getByLabel(en.operations.date, { exact: true }).focus();
  await expect(start.getByText(en.incidentHistory.invalidTime)).toBeVisible();
  await expect(review).toBeDisabled();
  await start
    .getByLabel(en.incidentHistory.time24, { exact: true })
    .fill("23:30");
  await end.getByLabel(en.incidentHistory.time24, { exact: true }).fill("0030");
  await end.getByLabel(en.operations.date, { exact: true }).focus();
  await expect(
    end.getByLabel(en.incidentHistory.time24, { exact: true }),
  ).toHaveValue("00:30");
  await expect(
    page.getByText(en.incidentHistory.invalidRange, { exact: true }),
  ).toBeVisible();
  await expect(review).toBeDisabled();
  await end.getByLabel(en.operations.date, { exact: true }).fill("2030-10-04");
  await expect(review).toBeEnabled();
  await review.click();
  await expect(
    page.getByRole("button", {
      name: en.managerOperations.recheck,
      exact: true,
    }),
  ).toBeVisible();
  expect(body).toMatchObject({
    startAtUtc: "2030-10-03T16:30:00.000Z",
    endAtUtc: "2030-10-03T17:30:00.000Z",
  });
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
});

test("incident block removal requires review and records only the successful step", async ({
  page,
}) => {
  let removed = false,
    deletes = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        canResolve: removed,
        impacts: removed
          ? []
          : [
              {
                sourceType: "ROOM_BLOCK",
                sourceId: noticeId,
                startAtUtc: session.startAtUtc,
                endAtUtc: session.endAtUtc,
                resolutionOptions: [{ action: "RemoveExistingBlock" }],
              },
            ],
      },
    }),
  );
  await page.route(`**/api/manager/room-blocks/${noticeId}`, (route) => {
    deletes++;
    removed = true;
    return route.fulfill({ status: 204 });
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  expect(deletes).toBe(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.close, exact: true })
    .first()
    .click();
  expect(deletes).toBe(0);
  await page
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText(en.managerOperations.noSteps, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: en.operations.roomBlock }).last(),
  ).toContainText(en.operations.roomBlock);
  expect(deletes).toBe(1);
});

test("incident PT review preserves input and does not record a rejected step", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        canResolve: false,
        impacts: [
          {
            sourceType: "PT_SESSION",
            sourceId: sessionId,
            startAtUtc: session.startAtUtc,
            endAtUtc: session.endAtUtc,
            resolutionOptions: [],
          },
        ],
      },
    }),
  );
  await page.route(
    `**/api/manager/pt-sessions/${sessionId}/cancel`,
    (route) => {
      writes++;
      expect(route.request().postDataJSON()).toEqual({
        reason: "Cancel affected PT session",
      });
      return route.fulfill({
        status: 409,
        json: {
          code: "session_conflict",
          message: "Session state has changed",
        },
      });
    },
  );
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  await page
    .getByLabel(en.operations.edit, { exact: true })
    .selectOption("cancel");
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .last()
    .fill("Cancel affected PT session");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .last()
    .click();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Session state has changed" }),
  ).toBeVisible();
  await expect(
    page.getByText(en.managerOperations.noSteps, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }).last(),
  ).toHaveValue("Cancel affected PT session");
  expect(writes).toBe(1);
});
test("incident final confirmation rechecks server impacts", async ({
  page,
}) => {
  let previews = 0,
    resolves = 0;
  await page.route("**/api/manager/incidents/preview", (route) => {
    previews++;
    return route.fulfill({
      json: {
        scope: "ROOM",
        roomId: 7,
        canResolve: previews === 1,
        blockReason: previews > 1 ? "New class appeared" : null,
        impacts: [],
      },
    });
  });
  await page.route("**/api/manager/incidents/resolve", (route) => {
    resolves++;
    return route.fulfill({ json: { incidentId: noticeId } });
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await expect(page.getByText("New class appeared")).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
  expect(resolves).toBe(0);
  expect(previews).toBe(2);
});
test("incident timeout blocks blind resolve retries", async ({ page }) => {
  let resolves = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        scope: "ROOM",
        roomId: 7,
        canResolve: true,
        blockReason: null,
        impacts: [],
      },
    }),
  );
  await page.route("**/api/manager/incidents/resolve", (route) => {
    resolves++;
    return route.abort("failed");
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.finalResolve })
    .click();
  await expect(
    page.getByText(en.managerOperations.unknownIncident),
  ).toBeVisible();
  expect(resolves).toBe(1);
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(en.managerOperations.unknownIncident),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.operations.review, exact: true }),
  ).toBeDisabled();
  expect(resolves).toBe(1);
});
test("notice supports rental members and sends once after review", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule?**", (route) =>
    route.fulfill({ json: [schedule[1]] }),
  );
  let sends = 0;
  await page.route("**/api/manager/notices", (route) => {
    sends++;
    expect(route.request().headers()["idempotency-key"]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(route.request().postDataJSON().recipientUserIds).toEqual([memberId]);
    return route.fulfill({ json: { noticeId } });
  });
  await page.goto("/manager/notices");
  await page
    .getByLabel(en.operations.recipients, { exact: true })
    .selectOption("MEMBER");
  await page.getByRole("checkbox", { name: "Member An", exact: true }).check();
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("Court update");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("Please check your rental schedule.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  expect(sends).toBe(0);
  await page
    .getByRole("button", { name: en.operations.send, exact: true })
    .click();
  await expect(page).toHaveURL(/noticeId=/);
  expect(sends).toBe(1);
  await expect(page.getByText(en.managerOperations.noticeGap)).toHaveCount(0);
});
test("notice receipt distinguishes failed delivery from business outcome", async ({
  page,
}) => {
  await page.goto(`/manager/notices/${noticeId}`);
  await expect(
    page.getByRole("columnheader", { name: en.wireStatus.FAILED, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: en.wireStatus.PENDING,
      exact: true,
    }),
  ).toBeVisible();
});

test("manual class scheduling preserves the draft without an unavailable AI action", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/api\/manager\/(classes|ai)/.test(request.url())
    )
      writes++;
  });
  await fillDraft(page);
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: en.managerOperations.aiTitle }),
  ).toHaveCount(0);
  await page.getByLabel(en.operations.numSessions, { exact: true }).fill("4");
  await expect(
    page.getByLabel(en.operations.numSessions, { exact: true }),
  ).toHaveValue("4");
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.code, { exact: true }),
  ).toHaveValue("TEST-NEW");
  await expect(
    page.getByLabel(en.operations.name, { exact: true }),
  ).toHaveValue("New badminton course");
  expect(writes).toBe(0);
});

test("notice audience changes clear selection and invalidate review", async ({
  page,
}) => {
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/manager/notices"))
      writes++;
  });
  await page.goto("/manager/notices");
  await page.getByRole("checkbox", { name: "Coach Linh", exact: true }).check();
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("Schedule update");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("Please review your schedule.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await expect(
    page.getByText(/Check the selected recipients before sending/),
  ).toBeVisible();
  await page
    .getByLabel(en.operations.recipients, { exact: true })
    .selectOption("MEMBER");
  await expect(
    page.getByRole("checkbox", { name: "Member An", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: en.operations.send, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: en.operations.review, exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(0);
});

test("notice locks its reviewed audience while sending and keeps one request", async ({
  page,
}) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let writes = 0;
  await page.route("**/api/manager/notices", async (route) => {
    writes++;
    expect(route.request().postDataJSON().recipientUserIds).toEqual([coachId]);
    await pending;
    await route.fulfill({ json: { noticeId } });
  });
  await page.goto("/manager/notices");
  await page.getByRole("checkbox", { name: "Coach Linh", exact: true }).check();
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("Coach timetable");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("Please review your timetable.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.send, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.recipients, { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Coach Linh", exact: true }),
  ).toBeDisabled();
  finish();
  await expect(page).toHaveURL(/noticeId=/);
  expect(writes).toBe(1);
});

test("notice recovery failure never unlocks a new send", async ({ page }) => {
  await page.route(`**/api/manager/notices/by-key/${noticeId}`, (route) =>
    route.fulfill({
      status: 503,
      json: { code: "unavailable", message: "Receipt lookup unavailable" },
    }),
  );
  await page.goto(`/manager/notices?noticeKey=${noticeId}`);
  await expect(page.getByText("Receipt lookup unavailable")).toBeVisible();
  await expect(
    page.getByLabel(en.operations.subject, { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Coach Linh", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start a new notice", exact: true }),
  ).toHaveCount(0);
});

test("incident confirmed steps remain visible when the next preview fails", async ({
  page,
}) => {
  let removed = false;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill(
      removed
        ? {
            status: 503,
            json: { code: "unavailable", message: "Recheck unavailable" },
          }
        : {
            json: {
              ...session,
              canResolve: false,
              impacts: [
                {
                  sourceType: "ROOM_BLOCK",
                  sourceId: noticeId,
                  startAtUtc: session.startAtUtc,
                  endAtUtc: session.endAtUtc,
                  resolutionOptions: [{ action: "RemoveExistingBlock" }],
                },
              ],
            },
          },
    ),
  );
  await page.route(`**/api/manager/room-blocks/${noticeId}`, (route) => {
    removed = true;
    return route.fulfill({ status: 204 });
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(page.getByText("Recheck unavailable")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: en.operations.roomBlock }).last(),
  ).toContainText("Confirmed by server");
  await expect(page.getByText(en.managerOperations.incidentGap)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
});

test("incident uses read-only display names and retains core impacts when display loading fails", async ({
  page,
}) => {
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        startAtUtc: session.startAtUtc,
        endAtUtc: session.endAtUtc,
        canResolve: false,
        impacts: [
          {
            sourceType: "CLASS_SESSION",
            sourceId: sessionId,
            startAtUtc: session.startAtUtc,
            endAtUtc: session.endAtUtc,
            resolutionOptions: [],
          },
        ],
      },
    }),
  );
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: en.calendar.types.CLASS_SESSION })
      .first(),
  ).toContainText("Badminton autumn");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: en.calendar.types.CLASS_SESSION })
      .first(),
  ).toContainText("Coach Linh");
  await page.route("**/api/manager/court-schedule?**", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "unavailable", message: "Display unavailable" },
    }),
  );
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await expect(page.getByText(/Display details are unavailable/)).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: en.calendar.types.CLASS_SESSION })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
});

test("incident does not report success for a final response without a receipt", async ({
  page,
}) => {
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({ json: { canResolve: true, impacts: [] } }),
  );
  await page.route("**/api/manager/incidents/resolve", (route) =>
    route.fulfill({ json: {} }),
  );
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.finalResolve })
    .click();
  await expect(
    page.getByText(en.managerOperations.unknownIncident),
  ).toBeVisible();
  await expect(
    page.getByText("Confirmed by server", { exact: true }),
  ).toHaveCount(0);
});

test("incident step timeout records unknown and blocks blind retry", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        canResolve: false,
        impacts: [
          {
            sourceType: "ROOM_BLOCK",
            sourceId: noticeId,
            startAtUtc: session.startAtUtc,
            endAtUtc: session.endAtUtc,
            resolutionOptions: [{ action: "RemoveExistingBlock" }],
          },
        ],
      },
    }),
  );
  await page.route(`**/api/manager/room-blocks/${noticeId}`, (route) => {
    writes++;
    return route.abort("failed");
  });
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.close, exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Outcome unknown — check before retrying", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.managerOperations.recheck }),
  ).toBeDisabled();
  await expect(
    page.getByText("Confirmed by server", { exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
});
test("Member cannot mount Manager operational requests", async ({ page }) => {
  let calls = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/manager/")) calls++;
  });
  await page.goto("/manager/classes/new");
  await expect(page).toHaveURL(/\/member/);
  expect(calls).toBe(0);
});
test("generated preview rejects duplicates, wrong start day and invalid session count", () => {
  expect(previewSessions(course, 90)).toHaveLength(2);
  expect(previewSessions({ ...course, numSessions: 101 }, 90)).toEqual([]);
  expect(previewSessions({ ...course, startDate: "2030-10-04" }, 90)).toEqual(
    [],
  );
  expect(
    previewSessions(
      {
        ...course,
        scheduleRules: [...course.scheduleRules, ...course.scheduleRules],
      },
      90,
    ),
  ).toEqual([]);
});
test("incident keeps the rejected attempt when the same PT action is retried successfully", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        canResolve: false,
        impacts: [
          {
            sourceType: "PT_SESSION",
            sourceId: sessionId,
            startAtUtc: session.startAtUtc,
            endAtUtc: session.endAtUtc,
            resolutionOptions: [],
          },
        ],
      },
    }),
  );
  await page.route(
    `**/api/manager/pt-sessions/${sessionId}/cancel`,
    (route) => {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? {
              status: 409,
              json: { code: "conflict", message: "Refresh this session" },
            }
          : { status: 204 },
      );
    },
  );
  await incidentInputs(page);
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  await page
    .getByLabel(en.operations.edit, { exact: true })
    .selectOption("cancel");
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .last()
    .fill("Cancel affected PT");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page.getByText("Rejected by server", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page.getByText("Confirmed by server", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Rejected by server", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

for (const width of [390, 960, 1440])
  test(`Manager operational pages fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/manager/classes",
      "/manager/classes/new",
      "/manager/classes/1?tab=holds",
      "/manager/schedule?view=list",
      "/manager/coaches",
      "/manager/facilities",
      "/manager/incidents",
      "/manager/notices",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
    }
    await page.goto("/manager/classes/1?tab=holds");
  });
test("Vietnamese copy and keyboard tabs preserve selected state", async ({
  page,
}) => {
  await page.goto("/manager/classes/1?tab=holds");
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    report.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  const tab = page.getByRole("tab", {
    name: vi.managerOperations.holdsTab,
    exact: true,
  });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", {
      name: vi.managerOperations.thresholdTab,
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
});

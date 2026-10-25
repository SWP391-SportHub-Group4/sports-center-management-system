import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";
import { vi } from "../src/locales/vi";
import { previewSessions } from "../src/features/courses/preview";
import { fillIncidentDateTime } from "./helpers/incident";
import { todayIso } from "../src/lib/format";

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
    if (p === "/api/manager/people")
      return route.fulfill({ json: paged([coach]) });
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
    if (p === `/api/manager/incidents/${noticeId}/notifications`)
      return route.fulfill({ json: delivery });
    if (p === "/api/refunds") return route.fulfill({ json: paged([]) });
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
test.beforeEach(async ({ page }, info) =>
  fixture(
    page,
    info.title.startsWith("Vietnamese copy") ? "vi" : "en",
    info.title.startsWith("Member cannot") ? "MEMBER" : "CENTER_MANAGER",
  ),
);
async function fillDraft(page: Page, proceed = true) {
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
  if (!proceed) return;
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
}

test("M05 locked coach details reassign the main class and refresh affected assignments", async ({
  page,
}) => {
  let assigned = false;
  let writes = 0;
  await page.route("**/api/manager/coach-coverage**", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        replacementCoachId: coachId,
        reason: "Replacement audit",
      });
      assigned = true;
      writes++;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: assigned
        ? []
        : [
            {
              coachId: memberId,
              coachName: "Locked coach",
              coachEmail: "locked@example.com",
              affectedClasses: 1,
              futureSessions: 1,
              activeRelationships: 1,
              mainClasses: [{ classId: 1, name: course.name, sportId: 3 }],
              sessions: [],
            },
          ],
    });
  });
  await page.route(`**/api/manager/coaches/${memberId}`, (route) =>
    route.fulfill({ json: { ...coach, userId: memberId, status: "LOCKED" } }),
  );
  await page.goto(`/manager/coaches/${memberId}`);
  await page
    .getByRole("button", { name: "Change main coach", exact: true })
    .click();
  await page
    .getByLabel(en.operations.coach, { exact: true })
    .selectOption(coachId);
  await page.getByLabel("Reason", { exact: true }).fill("Replacement audit");
  await page
    .getByRole("button", { name: "Confirm main coach", exact: true })
    .click();
  await expect(
    page.getByText("No assignments need a replacement."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("No assignments need a replacement."),
  ).toBeVisible();
  expect(writes).toBe(1);
});

test("M05 empty course cancellation previews before confirming and cannot repeat after refresh", async ({
  page,
}) => {
  let cancelled = false;
  let writes = 0;
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: {
        ...course,
        confirmedCount: 0,
        status: cancelled ? "CANCELLED" : "PUBLISHED",
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancellation-preview", (route) =>
    route.fulfill({
      json: {
        canCancel: true,
        previewToken: "audit-preview",
        totalSessions: 2,
        sessionsNotProvided: 2,
        confirmedCount: 0,
        activeHoldCount: 0,
        refundPoints: 0,
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancel", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      reason: "Cancellation audit",
      previewToken: "audit-preview",
    });
    cancelled = true;
    writes++;
    return route.fulfill({ json: {} });
  });
  await page.goto("/manager/classes/1?tab=management");
  await page
    .getByRole("button", { name: en.classWorkspace.cancelClass, exact: true })
    .click();
  const section = page.getByRole("dialog", {
    name: en.classWorkspace.cancelClass,
    exact: true,
  });
  await section
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Cancellation audit");
  await section
    .getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    })
    .click();
  expect(writes).toBe(0);
  await section
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(section).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test("M05 incident abandon reviews changes and displays steps that could not be undone", async ({
  page,
}) => {
  let abandoned = false;
  let writes = 0;
  const step = {
    stepId: sessionId,
    kind: "RESCHEDULE",
    className: course.name,
    sessionNo: 1,
    beforeStartUtc: session.startAtUtc,
    afterStartUtc: "2030-10-03T14:00:00Z",
    state: "APPLIED",
    undoNote: null,
    canUndo: true,
  };
  await page.route("**/api/manager/incidents/fences", (route) =>
    route.fulfill({
      json: abandoned
        ? []
        : [
            {
              fenceId: noticeId,
              scope: "ROOM",
              roomId: 7,
              roomName: "Court A",
              reason: "Audit incident",
              startAtUtc: session.startAtUtc,
              endAtUtc: session.endAtUtc,
              createdAtUtc: "2030-10-01T00:00:00Z",
              expiresAtUtc: "2030-10-03T15:00:00Z",
              isExpired: false,
              remainingImpacts: 0,
              affectedMemberCount: 1,
              canResolve: true,
              appliedSteps: 1,
            },
          ],
    }),
  );
  await page.route(
    `**/api/manager/incidents/fences/${noticeId}/steps`,
    (route) => route.fulfill({ json: [step] }),
  );
  await page.route(
    `**/api/manager/incidents/fences/${noticeId}/abandon`,
    (route) => {
      abandoned = true;
      writes++;
      return route.fulfill({
        json: {
          fenceId: noticeId,
          undone: 0,
          notUndone: [
            {
              ...step,
              state: "UNDO_FAILED",
              canUndo: false,
              undoNote:
                "The original room or coach is no longer free at that time.",
            },
          ],
        },
      });
    },
  );
  await page.goto("/manager/incidents");
  await page
    .getByRole("button", { name: "Abandon and undo", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(course.name, { exact: false })).toBeVisible();
  expect(writes).toBe(0);
  await dialog
    .getByRole("button", { name: "Abandon and undo", exact: true })
    .click();
  await expect(dialog).toContainText("0 changes undone.");
  await expect(dialog).toContainText("no longer free");
  await dialog
    .getByRole("button", { name: en.common.close, exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Abandon and undo", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
});

for (const late of [false, true]) {
  test(`M06 Manager handles ${late ? "missed opening" : "response deadline and waiver"}`, async ({
    page,
  }) => {
    let waivers = 0;
    await page.route("**/api/manager/classes/1", (route) =>
      route.fulfill({
        json: {
          ...course,
          status: "PUBLISHED",
          thresholdStatus: waivers ? "WAIVED_BY_MANAGER" : "AT_RISK",
          firstSessionStartUtc: late
            ? "2020-10-01T02:00:00Z"
            : "2030-10-03T11:00:00Z",
          thresholdResponseDeadlineUtc: late ? null : "2030-10-02T11:00:00Z",
        },
      }),
    );
    await page.route("**/api/manager/classes/1/threshold/waive", (route) => {
      expect(route.request().postDataJSON()).toEqual({
        reason: "Run this class with fewer members",
      });
      waivers++;
      return route.fulfill({ status: 204 });
    });
    await page.goto("/manager/classes/1?tab=threshold");
    await expect(
      page
        .locator("summary")
        .filter({ hasText: "How opening conditions work" }),
    ).toHaveCount(0);
    const waive = page.getByRole("button", {
      name: "Approve below threshold",
      exact: true,
    });
    if (late) {
      await expect(waive).toHaveCount(0);
      await expect(
        page.getByText(/planned opening has passed without confirmation/),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(/refunds remaining enrollments/),
      ).toBeVisible();
      await waive.click();
      const dialog = page.getByRole("dialog", {
        name: "Approve below threshold",
        exact: true,
      });
      await dialog
        .getByLabel(en.operations.reason, { exact: true })
        .fill("Run this class with fewer members");
      await dialog
        .getByRole("button", { name: "Approve below threshold", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      expect(waivers).toBe(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page
        .locator("main")
        .last()
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/m06-manager-${late}.png`,
      fullPage: true,
    });
  });
}

test("M06 public course distinguishes enrollment from confirmation to run", async ({
  page,
}) => {
  let confirmed = false;
  await page.route("**/api/classes/1", (route) =>
    route.fulfill({
      json: {
        ...course,
        status: "PUBLISHED",
        enrollmentOpen: true,
        firstSessionStartUtc: "2030-10-03T11:00:00Z",
        openingConfirmed: confirmed,
      },
    }),
  );
  await page.route("**/api/classes/1/public-sessions", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/courses/1");
  await expect(
    page.getByText("Opening not confirmed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/center is reviewing enrollment/)).toBeVisible();
  confirmed = true;
  await page.reload();
  await expect(
    page.getByText("Confirmed to run", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Opening not confirmed", { exact: true }),
  ).toHaveCount(0);
});

test("class quick views survive reload and reset pagination", async ({
  page,
}) => {
  await page.goto("/manager/classes?page=3");
  await page.locator("details > summary").first().click();
  await page
    .getByRole("button", { name: en.wireStatus.AT_RISK, exact: true })
    .click();
  await expect(page).toHaveURL(/status=PUBLISHED/);
  await expect(page).toHaveURL(/thresholdStatus=AT_RISK/);
  await expect(page).not.toHaveURL(/page=3/);
  await page.reload();
  await page.locator("details > summary").first().click();
  await expect(
    page.getByRole("button", { name: en.wireStatus.AT_RISK, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
  await expect(
    page.getByLabel(en.classWorkspace.price, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.classWorkspace.cost, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("class-pricing-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("class-pricing-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: en.operations.refresh, exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("create-class-review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("create-class-review-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft })
    .click();
  await expect(page).toHaveURL(/\/manager\/classes\/1$/);
  expect(creates).toBe(1);
  expect(publishes).toBe(0);
});
test("threshold and capacity guards stop invalid drafts", async ({ page }) => {
  await fillDraft(page);
  await page
    .getByLabel(en.classWorkspace.cost, { exact: true })
    .fill("3900000");
  await expect(
    page.getByText(en.managerOperations.thresholdExceeded),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.operations.next, exact: true }),
  ).toBeDisabled();
  await page.getByLabel(en.classWorkspace.cost, { exact: true }).fill("0");
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
    page.getByRole("button", { name: /^Seat holds/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(reads).toEqual(["/api/manager/classes/1/holds"]);
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
test("edit session shows the selected week and excludes only the edited session", async ({
  page,
}) => {
  const weeks: string[] = [];
  await page.route("**/api/manager/court-schedule?**", (route) => {
    weeks.push(new URL(route.request().url()).searchParams.get("fromDate")!);
    return route.fulfill({
      json: [
        schedule[0],
        {
          ...schedule[0],
          sourceId: "another-session",
          title: "Another class session",
          roomId: 8,
          coachName: "Basketball Coach - Advanced Development",
        },
        {
          ...schedule[0],
          sourceId: "long-session",
          title: "Basketball fundamentals and technical development",
          coachName: "Trinh Thang Bang - Basketball Coach",
          startAtUtc: "2030-10-01T02:00:00Z",
          endAtUtc: "2030-10-01T04:00:00Z",
        },
        {
          ...schedule[0],
          sourceId: "unrelated-session",
          title: "Unrelated session",
          roomId: 8,
          coachId: memberId,
        },
      ],
    });
  });
  await page.goto("/manager/classes/1?tab=sessions");
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const calendar = dialog.getByRole("region", {
    name: en.classScheduleLookup.title,
    exact: true,
  });
  await expect(
    calendar.getByRole("article", {
      name: "Another class session",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    calendar.getByRole("article", {
      name: "Another class session",
      exact: true,
    }),
  ).toHaveAttribute("data-conflict", "true");
  await expect(
    calendar.getByRole("article", { name: "Badminton autumn", exact: true }),
  ).toHaveCount(0);
  await expect(
    calendar.getByRole("article", { name: "Unrelated session", exact: true }),
  ).toHaveCount(0);
  expect(weeks).toContain("2030-09-30");
  await page.setViewportSize({ width: 1440, height: 1100 });
  const headers = calendar.locator("header");
  const headerHeights = await headers.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height),
  );
  expect(new Set(headerHeights).size).toBe(1);
  for (const event of await calendar.getByRole("article").all()) {
    expect(
      await event.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("edit-session-week-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await calendar.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("edit-session-week-mobile.png"),
  });
  await dialog
    .getByLabel(en.operations.start, { exact: true })
    .fill("2030-10-10T18:00");
  await expect.poll(() => weeks.at(-1)).toBe("2030-10-07");
  await calendar
    .getByRole("button", { name: en.mSchedule.nextWeek, exact: true })
    .click();
  await expect.poll(() => weeks.at(-1)).toBe("2030-10-14");
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Move next week");
  await dialog
    .getByRole("button", {
      name: en.managerOperations.reviewChange,
      exact: true,
    })
    .click();
  await expect(calendar).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeVisible();
});

test("session change is reviewed and rejection does not save", async ({
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
  await expect(
    dialog.getByRole("button", { name: en.managerOperations.editReview }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: en.operations.refresh, exact: true }),
  ).toHaveCount(0);
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
  await expect(
    dialog.getByRole("button", { name: en.managerOperations.editReview }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: en.operations.refresh, exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("session-confirm-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("session-confirm-mobile.png"),
  });
  await dialog
    .getByRole("button", { name: en.common.close, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Move to next week");
  await dialog
    .getByRole("button", { name: en.managerOperations.reviewChange })
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
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("Keep this reason");
});

test("threshold pricing saves and closes before refreshing the class", async ({
  page,
}) => {
  let price = course.price;
  let saves = 0;
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({ json: { ...course, status: "PUBLISHED", price } }),
  );
  await page.route("**/api/manager/classes/1/threshold/pricing", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({
      price: 500000,
      costAmount: course.costAmount,
      reason: "Adjust tuition for this class",
    });
    price = 500000;
    saves++;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/manager/classes/1?tab=threshold");
  await page.getByRole("button", { name: "Edit pricing", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit pricing",
    exact: true,
  });
  const tuition = dialog.getByLabel(en.classWorkspace.price, { exact: true });
  const cost = dialog.getByLabel(en.classWorkspace.cost, { exact: true });
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(tuition).toHaveValue(String(course.price));
  await expect(cost).toHaveValue(String(course.costAmount));
  await expect(save).toBeDisabled();
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Adjust tuition for this class");
  await cost.fill("6000000");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(save).toBeDisabled();
  await tuition.fill("500001");
  await expect(save).toBeDisabled();
  await tuition.fill("500000");
  await cost.fill(String(course.costAmount));
  await expect(dialog.getByText("4 / 12", { exact: true })).toBeVisible();
  await save.click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Edit pricing", exact: true }).click();
  await expect(tuition).toHaveValue("500000");
  await expect(
    dialog.getByLabel(en.operations.reason, { exact: true }),
  ).toBeEmpty();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saves).toBe(1);
});

test("opening conditions omits guidance and threshold responses", async ({
  page,
}) => {
  const responseReads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/threshold-responses"))
      responseReads.push(request.url());
  });
  await page.goto("/manager/classes/1?tab=threshold");
  await expect(
    page.getByRole("heading", { name: en.managerOperations.thresholdTab }),
  ).toBeVisible();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: en.operations.thresholdResponses }),
  ).toHaveCount(0);
  await expect(
    page.locator("summary").filter({ hasText: "How opening conditions work" }),
  ).toHaveCount(0);
  await expect(page.getByText(en.classWorkspace.pricingLocked)).toBeVisible();
  expect(responseReads).toEqual([]);
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
test("center incident appears once in schedule and shows all affected rooms", async ({
  page,
}) => {
  const centerId = "66666666-6666-4666-8666-666666666666";
  await page.route("**/api/rooms", (route) =>
    route.fulfill({
      json: [...rooms, { roomId: 8, name: "Court B", isActive: true }],
    }),
  );
  await page.route("**/api/manager/court-schedule?**", (route) =>
    route.fulfill({
      json: [
        ...[7, 8].map((roomId, index) => ({
          sourceType: "ROOM_BLOCK",
          sourceId: `${index}1111111-1111-4111-8111-111111111111`,
          roomId,
          startAtUtc: "2030-10-03T02:00:00Z",
          endAtUtc: "2030-10-03T04:00:00Z",
          title: "Center maintenance",
          status: "BLOCKED",
          participants: [],
          incidentId: centerId,
          incidentScope: "CENTER",
          affectedRoomIds: [7, 8],
        })),
        // Same title and time do not imply the same incident.
        {
          sourceType: "ROOM_BLOCK",
          sourceId: noticeId,
          roomId: 7,
          startAtUtc: "2030-10-03T02:00:00Z",
          endAtUtc: "2030-10-03T04:00:00Z",
          title: "Separate room repair",
          status: "BLOCKED",
          participants: [],
          incidentId: noticeId,
          incidentScope: "ROOM",
          affectedRoomIds: [7],
        },
      ],
    }),
  );
  await page.goto("/manager/schedule?date=2030-10-03&view=day");
  await expect(
    page.getByText("Center maintenance", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Separate room repair", { exact: true }),
  ).toHaveCount(1);
  await page.getByText("Center maintenance", { exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByText(en.incidentHistory.entireCenter, { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByRole("listitem")).toHaveText(["Court A", "Court B"]);
  await expect(
    drawer.getByRole("link", { name: en.incidentHistory.details }),
  ).toHaveAttribute("href", `/manager/incidents/${centerId}`);
});

test("schedule keeps its context without AI placeholder actions", async ({
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
  await expect(page).toHaveURL(/roomId=7/);
  expect(writes).toBe(0);
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
  await expect(
    page.getByRole("heading", {
      name: en.operations.openingHours,
      exact: true,
    }),
  ).toBeVisible();
});
async function incidentInputs(page: Page) {
  await page.goto("/manager/incidents?roomId=7");
  await fillIncidentDateTime(page, en.operations.start, "2030-10-03T18:00");
  await fillIncidentDateTime(page, en.operations.end, "2030-10-03T21:00");
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Water leak");
}

test("incident confirmation popup returns to the draft without resolving", async ({
  page,
}) => {
  let resolves = 0;
  await page.route("**/api/manager/incidents/preview", (route) =>
    route.fulfill({
      json: {
        ...route.request().postDataJSON(),
        canResolve: true,
        impacts: [],
        blockReason: null,
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
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  const dialog = page.getByRole("dialog", {
    name: en.managerOperations.resolveReview,
  });
  await expect(dialog.getByText("Court A", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: en.incidentHistory.backToImpacts })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("Water leak");
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(resolves).toBe(0);
});

test("incident APIs complete the gym closure flow and retain the chosen extension", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  let resolved = false;
  let listReads = 0;
  let deliveryReads = 0;
  const incident = {
    incidentId: noticeId,
    scope: "CENTER",
    roomId: null,
    roomName: null,
    startAtUtc: "2030-10-03T11:00:00Z",
    endAtUtc: "2030-10-03T14:00:00Z",
    reason: "Water leak",
    resolutionSummary: "Memberships extended by 2 days.",
    createdAtUtc: "2030-10-01T00:00:00Z",
  };
  await page.route("**/api/manager/incidents?*", (route) => {
    listReads++;
    return route.fulfill({ json: paged(resolved ? [incident] : []) });
  });
  await page.route("**/api/manager/incidents/preview", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        ...incident,
        impacts: [],
        canResolve: true,
        blockReason: null,
        closesGym: true,
        suggestedMembershipExtensionDays: 1,
        affectedMemberCount: 4,
      },
    });
  });
  await page.route("**/api/manager/incidents/resolve", (route) => {
    requests.push(route.request().postDataJSON());
    resolved = true;
    return route.fulfill({ json: { incidentId: noticeId } });
  });
  await page.route(`**/api/manager/incidents/${noticeId}`, (route) =>
    route.fulfill({ json: incident }),
  );
  await page.route(
    `**/api/manager/incidents/${noticeId}/notifications`,
    (route) => {
      deliveryReads++;
      return route.fulfill({ json: delivery });
    },
  );
  await incidentInputs(page);
  await page
    .getByLabel(en.operations.scope, { exact: true })
    .selectOption("CENTER");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  const extension = page.getByRole("spinbutton");
  await expect(extension).toHaveValue("1");
  for (const invalid of ["", "-1", "32", "1.5"]) {
    await extension.fill(invalid);
    await expect(
      page.getByText(en.incidentHistory.invalidExtension),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: en.managerOperations.recheck }),
    ).toBeDisabled();
  }
  await extension.fill("2");
  await page
    .getByRole("button", { name: en.managerOperations.recheck })
    .click();
  await expect(page.getByText("Membership extension: 2 days.")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: en.managerOperations.resolveReview }),
  ).toBeVisible();
  expect(resolved).toBe(false);
  await page
    .getByRole("button", { name: en.managerOperations.finalResolve })
    .click();
  await expect(page).toHaveURL(new RegExp(`incidentId=${noticeId}`));
  expect(requests).toHaveLength(3);
  expect(requests[0]).toEqual({
    scope: "CENTER",
    roomId: null,
    startAtUtc: new Date(incident.startAtUtc).toISOString(),
    endAtUtc: new Date(incident.endAtUtc).toISOString(),
    reason: incident.reason,
  });
  expect(requests[2]).toEqual({ ...requests[0], membershipExtensionDays: 2 });
  await expect(
    page.getByRole("region", {
      name: en.managerOperations.incidentHistory,
      exact: true,
    }),
  ).toContainText("Water leak");
  expect(listReads).toBeGreaterThanOrEqual(2);
  await page
    .getByRole("link", { name: en.operations.details, exact: true })
    .first()
    .click();
  await expect(page.getByText(incident.resolutionSummary)).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Sent", exact: true }),
  ).toBeVisible();
  expect(deliveryReads).toBeGreaterThanOrEqual(2);
});

test("incident invalid periods and whitespace reasons never reach preview", async ({
  page,
}) => {
  let previews = 0;
  await page.route("**/api/manager/incidents/preview", (route) => {
    previews++;
    return route.fulfill({ json: { impacts: [], canResolve: true } });
  });
  await incidentInputs(page);
  await fillIncidentDateTime(page, en.operations.end, "2030-11-04T21:00");
  await expect(page.getByText(en.incidentHistory.rangeTooLong)).toBeVisible();
  const review = page.getByRole("button", {
    name: en.operations.review,
    exact: true,
  });
  await expect(review).toBeDisabled();
  await fillIncidentDateTime(page, en.operations.start, "2020-10-03T18:00");
  await fillIncidentDateTime(page, en.operations.end, "2020-10-03T21:00");
  await expect(page.getByText(en.incidentHistory.endInPast)).toHaveCount(0);
  await expect(review).toBeEnabled();
  await fillIncidentDateTime(page, en.operations.start, "2030-10-03T18:00");
  await fillIncidentDateTime(page, en.operations.end, "2030-10-03T21:00");
  await page.getByLabel(en.operations.reason, { exact: true }).fill("   ");
  await expect(review).toBeDisabled();
  expect(previews).toBe(0);
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
    .last()
    .click();
  expect(deletes).toBe(0);
  await page
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Affected activities", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Affected activities", exact: true })
    .getByRole("button", { name: en.operations.close, exact: true })
    .click();
  await expect(
    page.getByText(en.managerOperations.noSteps, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Confirmed by server" }),
  ).toContainText(en.operations.roomBlock);
  expect(deletes).toBe(1);
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
  await expect(
    page.getByRole("button", { name: en.manualNotices.history, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: en.manualNotices.openDetails, exact: true }),
  ).toBeVisible();
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

test("manual scheduling preserves the class draft without AI actions or writes", async ({
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
    page.getByRole("button", {
      name: en.managerOperations.aiTitle,
      exact: true,
    }),
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
    page.getByText(
      "Review the selected recipients and delivery channels before sending.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/G07|Waiting for API/i)).toHaveCount(0);
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
    page.getByRole("row").filter({ hasText: en.operations.roomBlock }),
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
    page.getByRole("row").filter({ hasText: en.operations.classSession }),
  ).toContainText("Badminton autumn");
  await expect(
    page.getByRole("row").filter({ hasText: en.operations.classSession }),
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
    page.getByRole("row").filter({ hasText: en.operations.classSession }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
});

test("incident session edits open in a popup and return to the impacts", async ({
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
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: en.incidentHistory.editSession,
  });
  await expect(
    dialog.getByLabel(en.operations.reason, { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel(en.operations.reason, { exact: true }).fill("Test");
  await dialog
    .getByRole("button", { name: en.managerOperations.reviewChange })
    .click();
  await expect(
    dialog.getByText(en.managerOperations.newSchedule, { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Reschedule · Test", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(en.managerOperations.previewConfirmationHint),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: en.operations.refresh, exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: en.common.close, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: en.managerOperations.recheck }),
  ).toBeEnabled();
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
    .last()
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
for (const width of [390, 1440])
  test(`Manager form labels and long dialog actions stay usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    for (const path of [
      "/manager/training-rooms",
      "/manager/coaches",
      "/manager/classes/new",
      "/manager/notices",
      "/manager/incidents",
    ]) {
      await page.goto(
        path.endsWith("coaches") ? `/manager/coaches/${coachId}` : path,
      );
      if (path.endsWith("training-rooms") || path.endsWith("coaches"))
        await page
          .getByRole("button", {
            name: path.endsWith("training-rooms")
              ? "Add room only"
              : en.operations.edit,
            exact: true,
          })
          .click();
      const surface = (await page.getByRole("dialog").count())
        ? page.getByRole("dialog")
        : page.locator("main");
      await expect(surface.locator(".field").first()).toBeVisible();
      const positions = await surface
        .locator(
          ".field input[aria-labelledby], .field select[aria-labelledby], .field textarea[aria-labelledby]",
        )
        .evaluateAll((controls) =>
          controls.map((control) => {
            const label = document.getElementById(
              control.getAttribute("aria-labelledby")!,
            );
            const input = control.getBoundingClientRect();
            const caption = label!.getBoundingClientRect();
            return {
              offset: Math.abs(input.left - caption.left),
              labelAbove: caption.bottom <= input.top + 1,
            };
          }),
        );
      expect(positions.length).toBeGreaterThan(1);
      for (const position of positions) {
        expect(position.offset).toBeLessThanOrEqual(1);
        expect(position.labelAbove).toBe(true);
      }
      if (path.endsWith("coaches")) {
        const modal = page.getByRole("dialog");
        const close = modal.getByRole("button", {
          name: en.operations.cancel,
          exact: true,
        });
        const save = modal.getByRole("button", {
          name: en.operations.save,
          exact: true,
        });
        await expect(save).toBeInViewport();
        await modal.evaluate(async (element) => {
          await Promise.all(
            element
              .getAnimations()
              .map((animation) => animation.finished.catch(() => undefined)),
          );
        });
        const before = await close.boundingBox();
        await modal.locator(".dialog__body").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await expect(save).toBeInViewport();
        await expect(close).toBeInViewport();
        expect((await close.boundingBox())!.y).toBeCloseTo(before!.y, 0);
        await close.click();
        await expect(modal).toHaveCount(0);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  });

test("schedule has one view selector and daily navigation moves one day", async ({
  page,
}) => {
  await page.goto("/manager/schedule?date=2030-10-03&view=day");
  const day = page.getByRole("button", { name: en.calendar.day, exact: true });
  await expect(day).toHaveCount(1);
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: en.calendar.next, exact: true })
    .click();
  await expect(page).toHaveURL(/date=2030-10-04/);
  await expect(
    page.getByLabel(en.operations.date, { exact: true }),
  ).toHaveValue("2030-10-04");
  await page
    .getByRole("button", { name: en.calendar.list, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: en.calendar.list, exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: en.calendar.list, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: en.mSchedule.nextWeek, exact: true })
    .click();
  await expect(page).toHaveURL(/date=2030-10-07/);
  await page
    .getByRole("button", { name: en.calendar.week, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: en.calendar.week, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: en.calendar.week, exact: true })
        .evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  const viewColors = await page
    .getByRole("group", { name: en.mSchedule.viewLabel, exact: true })
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        selected: node.getAttribute("aria-pressed") === "true",
        background: getComputedStyle(node).backgroundColor,
      })),
    );
  expect(viewColors.find((item) => item.selected)?.background).not.toBe(
    viewColors.find((item) => !item.selected)?.background,
  );
  await page
    .getByRole("button", { name: en.mSchedule.prevWeek, exact: true })
    .click();
  await expect(page).toHaveURL(/date=2030-09-30/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: en.calendar.week, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: en.mSchedule.currentWeek, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.date, { exact: true }),
  ).toHaveValue(todayIso());
});

test("Vietnamese copy and keyboard tabs preserve selected state", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/manager/classes/1?tab=holds");
  await expect(
    page
      .locator("main")
      .getByRole("button", { name: "Refresh", exact: true })
      .last(),
  ).toHaveCount(0);
  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    report.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  const tab = page.getByRole("tab", {
    name: vi.managerOperations.studentsTab,
    exact: true,
  });
  await tab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", {
      name: "Management",
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
});

test("class weekly schedule shows Coach or room bookings without AI or changing the draft", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-10-16T05:00:00Z"));
  const requests: string[] = [];
  let writes = 0;
  page.on("request", (r) => {
    if (
      r.url().includes("/api/ai/") ||
      (["POST", "PUT", "DELETE"].includes(r.method()) &&
        r.url().includes("/api/"))
    )
      writes++;
  });
  await page.route("**/api/manager/court-schedule**", (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("roomId")).toBeFalsy();
    requests.push(url.searchParams.get("fromDate")!);
    return route.fulfill({
      json: [
        ...schedule,
        {
          ...schedule[0],
          sourceId: "other-room",
          roomId: 8,
          classId: 2,
          title: "Coach in another room",
        },
        {
          ...schedule[0],
          sourceId: "unrelated",
          roomId: 8,
          coachId: memberId,
          classId: 3,
          title: "Unrelated class",
        },
        {
          ...schedule[1],
          sourceId: "blocked",
          sourceType: "ROOM_BLOCK",
          title: "Court maintenance",
        },
      ],
    });
  });
  await fillDraft(page);
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: en.managerOperations.aiTitle }),
  ).toHaveCount(0);
  const panel = page.getByRole("region", {
    name: en.classScheduleLookup.title,
    exact: true,
  });
  await expect(
    panel.getByText("Coach in another room", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Rental by An", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("Court maintenance", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Unrelated class", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "View weekly schedule", exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await expect(panel).not.toContainText("Vietnam time (UTC+7)");
  await expect(panel).not.toContainText("Your changes stay in the form");
  await expect(panel).not.toContainText("Check existing classes");
  await page.screenshot({
    fullPage: true,
    path: test.info().outputPath("weekly-schedule-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.getByText("Coach in another room", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: test.info().outputPath("weekly-schedule-mobile.png"),
  });
  await panel
    .getByRole("button", { name: en.mSchedule.nextWeek, exact: true })
    .click();
  await expect.poll(() => requests.at(-1)).toBe("2030-10-07");
  await panel
    .getByRole("button", {
      name: en.mSchedule.currentWeek,
      exact: true,
    })
    .click();
  await expect.poll(() => requests.at(-1)).toBe("2030-10-14");
  await expect(panel).toBeVisible();
  await expect(
    page.getByLabel(en.operations.coach, { exact: true }),
  ).toHaveValue(coachId);
  await expect(
    page.getByLabel(en.operations.room, { exact: true }),
  ).toHaveValue("7");
  await expect(
    page.getByLabel(en.operations.startDate, { exact: true }),
  ).toHaveValue("2030-10-03");
  await expect(page).toHaveURL(/manager\/classes\/new$/);
  await page
    .getByLabel(en.operations.startDate, { exact: true })
    .fill("2030-10-10");
  await expect.poll(() => requests.at(-1)).toBe("2030-10-07");
  expect(writes).toBe(0);
});

test("class weekly schedule retries failed loading without losing form data", async ({
  page,
}) => {
  await fillDraft(page);
  let calls = 0;
  await page.route("**/api/manager/court-schedule**", (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 503,
          json: {
            error: "schedule_unavailable",
            message: "Schedule temporarily unavailable",
          },
        })
      : route.fulfill({ json: [] });
  });
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: en.classScheduleLookup.title,
    exact: true,
  });
  await expect(panel).toContainText("Schedule temporarily unavailable");
  await panel
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    en.classScheduleLookup.empty,
  );
  await expect(
    page.getByLabel(en.operations.numSessions, { exact: true }),
  ).toHaveValue("2");
});

test("class schedule conflict color follows the draft and ignores adjacent or cancelled bookings", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule**", (route) =>
    route.fulfill({
      json: [
        {
          ...schedule[0],
          sourceId: "busy-coach",
          roomId: 8,
          title: "Busy coach",
        },
        {
          ...schedule[0],
          sourceId: "later-room",
          coachId: memberId,
          title: "Later room booking",
          startAtUtc: "2030-10-03T12:30:00Z",
          endAtUtc: "2030-10-03T14:00:00Z",
        },
        {
          ...schedule[0],
          sourceId: "cancelled",
          title: "Cancelled booking",
          status: "CANCELLED",
        },
      ],
    }),
  );
  await fillDraft(page);
  await page
    .getByRole("button", { name: en.operations.previous, exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: en.classScheduleLookup.title,
    exact: true,
  });
  const busy = panel.getByRole("article", { name: "Busy coach", exact: true });
  const later = panel.getByRole("article", {
    name: "Later room booking",
    exact: true,
  });
  const cancelled = panel.getByRole("article", {
    name: "Cancelled booking",
    exact: true,
  });
  await expect(busy).toHaveAttribute("data-conflict", "true");
  await expect(busy).toHaveCSS("background-color", "rgba(214, 115, 79, 0.73)");
  await expect(busy).toContainText(en.classScheduleLookup.conflict);
  await busy.click();
  await expect(panel.getByText("Busy coach", { exact: true })).toHaveCount(1);
  await expect(later).not.toHaveAttribute("data-conflict", "true");
  await expect(cancelled).not.toHaveAttribute("data-conflict", "true");
  await page.getByLabel(en.operations.start, { exact: true }).fill("20:00");
  await expect(busy).not.toHaveAttribute("data-conflict", "true");
  await expect(later).toHaveAttribute("data-conflict", "true");
  await expect(cancelled).not.toHaveAttribute("data-conflict", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const next = page.getByRole("button", {
    name: en.operations.next,
    exact: true,
  });
  await next.hover();
  await expect(next.locator("svg")).toHaveCSS("transform", "none");
  await expect(next.locator("svg")).toHaveCSS("width", "24px");
});

test("full class shows automatic enrollment status without manual controls", async ({
  page,
}) => {
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: {
        ...course,
        status: "PUBLISHED",
        capacity: 4,
        confirmedCount: 4,
        reservedCount: 4,
        enrollmentOpen: false,
        availableSeats: 0,
        activeHoldCount: 0,
      },
    }),
  );
  await page.goto("/manager/classes/1?tab=management");
  await expect(
    page.getByText(en.managerOperations.enrollmentFull, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(en.managerOperations.enrollmentFullHint, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close enrollment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reopen enrollment", exact: true }),
  ).toHaveCount(0);
});

test("enrolled class hides cancellation and keeps rescheduling available", async ({
  page,
}) => {
  await page.route("**/api/manager/classes/1/cancellation-preview", (route) =>
    route.fulfill({
      json: {
        canCancel: false,
        refundsImmediately: false,
        confirmedCount: 4,
        activeHoldCount: 0,
        totalSessions: 2,
        sessionsNotProvided: 2,
        refundPoints: 0,
      },
    }),
  );
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: { ...course, status: "PUBLISHED", enrollmentOpen: true },
    }),
  );
  let cancellations = 0;
  await page.route("**/api/manager/classes/1/cancel", (route) => {
    cancellations++;
    return route.fulfill({
      status: 409,
      json: { error: "class_has_enrollments" },
    });
  });
  await page.goto("/manager/classes/1?tab=management");
  await expect(
    page.getByRole("button", {
      name: en.classWorkspace.cancelClass,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText(en.classWorkspace.enrolledCancellationBlocked, {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("enrolled-class-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("enrolled-class-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: en.classWorkspace.viewSchedule, exact: true })
    .click();
  await expect(
    page.getByRole("tab", {
      name: en.managerOperations.sessionsTab,
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("option", { name: en.operations.makeup, exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByLabel(en.operations.start, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel(en.operations.room, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel(en.operations.coach, { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
    en.classWorkspace.editSession,
  );
  await expect(
    dialog.getByRole("button", { name: en.common.close, exact: true }),
  ).toHaveCount(1);
  await expect(
    dialog.getByText(en.operations.notifyHint, { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("session-editor-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath("session-editor-desktop.png"),
    fullPage: true,
  });
  expect(cancellations).toBe(0);
});

test("at-risk class cancellation remains available with enrolled students and reviews immediate refunds", async ({
  page,
}) => {
  let cancelled = false;
  let writes = 0;
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: {
        ...course,
        status: cancelled ? "CANCELLED" : "PUBLISHED",
        thresholdStatus: "AT_RISK",
        enrollmentOpen: false,
        thresholdResponseDeadlineUtc: null,
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancellation-preview", (route) =>
    route.fulfill({
      json: {
        canCancel: true,
        refundsImmediately: true,
        previewToken: "threshold-preview",
        confirmedCount: 4,
        activeHoldCount: 0,
        totalSessions: 2,
        sessionsNotProvided: 2,
        refundPoints: 1200,
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancel", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      reason: "Below enrollment threshold",
      previewToken: "threshold-preview",
    });
    cancelled = true;
    writes++;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/manager/classes/1?tab=threshold");
  await page
    .getByRole("button", {
      name: en.classWorkspace.cancelAndRefund,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cancel class",
    exact: true,
  });
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Below enrollment threshold");
  await dialog
    .getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    })
    .click();
  await expect(dialog).toContainText(
    en.classWorkspace.cancelBelowThresholdHint,
  );
  await expect(dialog).not.toContainText("Course interests");
  await expect(
    dialog.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `../.tmp/manager-threshold-cancellation-${device}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);
});

test("create schedule blocks Next during conflicts and unlocks after a valid replacement", async ({
  page,
}) => {
  let blocked = true;
  await page.route("**/api/manager/class-schedule/availability?**", (route) =>
    route.fulfill({
      json: {
        available: !blocked,
        roomName: "Court A",
        coachName: "Coach",
        reasons: blocked ? ["room_occupied"] : [],
      },
    }),
  );
  await fillDraft(page, false);
  const next = page.getByRole("button", {
    name: en.operations.next,
    exact: true,
  });
  await expect(next).toBeDisabled();
  await page
    .getByLabel(en.operations.numSessions, { exact: true })
    .press("Enter");
  await expect(
    page.getByLabel(en.operations.coach, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.impeccable/review/operations-conflict-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/operations-conflict-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  blocked = false;
  await page.getByLabel(en.operations.numSessions, { exact: true }).fill("3");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(
    page.getByLabel(en.classWorkspace.price, { exact: true }),
  ).toBeVisible();
});

test("below-threshold Manager cancellation previews immediate refunds and then notifies through the cancel API", async ({
  page,
}) => {
  let cancelled = false,
    cancels = 0;
  await page.route("**/api/manager/classes/1", (route) =>
    route.fulfill({
      json: {
        ...course,
        status: cancelled ? "CANCELLED" : "PUBLISHED",
        thresholdStatus: "AT_RISK",
        thresholdResponseDeadlineUtc: null,
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancellation-preview", (route) =>
    route.fulfill({
      json: {
        canCancel: true,
        refundsImmediately: true,
        previewToken: "current-roster",
        totalSessions: 2,
        sessionsNotProvided: 2,
        confirmedCount: 4,
        activeHoldCount: 0,
        refundPoints: 1200,
      },
    }),
  );
  await page.route("**/api/manager/classes/1/cancel", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      reason: "Not enough enrolled members",
      previewToken: "current-roster",
    });
    cancels++;
    cancelled = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/manager/classes/1?tab=threshold");
  await page
    .getByText("Cancel class and notify members", { exact: true })
    .click();
  const form = page.locator("details").filter({
    has: page.locator("summary", {
      hasText: "Cancel class and notify members",
    }),
  });
  await form
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Not enough enrolled members");
  await form
    .getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    })
    .click();
  await expect(form.getByText(/then chooses to receive/)).toBeVisible();
  expect(cancels).toBe(0);
  await page.screenshot({
    path: "../.impeccable/review/operations-threshold-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/operations-threshold-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await form
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect.poll(() => cancels).toBe(1);
  await expect(
    page.getByText("Cancel class and notify members", { exact: true }),
  ).toHaveCount(0);
});

test("schedule explains past Vietnam times and keeps Next blocked until corrected", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.clock.setFixedTime(new Date("2030-10-03T12:00:00Z"));
  await fillDraft(page, false);
  const next = page.getByRole("button", {
    name: en.operations.next,
    exact: true,
  });
  const notice = page.locator('[class*="scheduleFeedback"][data-state]');
  await expect(notice).toContainText(
    en.managerOperations.scheduleValidation.issues.pastTime,
  );
  await expect(next).toBeDisabled();
  await page
    .getByLabel(en.operations.numSessions, { exact: true })
    .press("Enter");
  await expect(
    page.getByLabel(en.operations.coach, { exact: true }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path:
        (process.env.SCHEDULE_REVIEW_DIR ?? "../.impeccable/review") +
        "/class-schedule-past-" +
        width +
        ".png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel(en.operations.start, { exact: true }).fill("20:00");
  await expect(next).toBeEnabled();
  await page
    .getByLabel(en.operations.startDate, { exact: true })
    .fill("2030-10-02");
  await expect(notice).toContainText(
    en.managerOperations.scheduleValidation.issues.pastDate,
  );
  await expect(next).toBeDisabled();
});

test("schedule lists distinct reasons and blocks Next for every unavailable resource", async ({
  page,
}) => {
  let reason = "room_busy";
  await page.route("**/api/manager/class-schedule/availability?**", (route) =>
    route.fulfill({
      json: {
        available: false,
        roomName: "Court A",
        coachName: "Coach",
        reasons: [reason],
      },
    }),
  );
  await fillDraft(page, false);
  const next = page.getByRole("button", {
    name: en.operations.next,
    exact: true,
  });
  const notice = page.locator('[class*="scheduleFeedback"][data-state]');
  const reasons = en.managerOperations.scheduleValidation.reasons;
  for (const [index, key] of [
    "room_busy",
    "coach_busy",
    "outside_opening_hours",
    "room_inactive",
    "room_type_inactive",
    "room_not_found",
    "room_incompatible",
    "room_capacity_exceeded",
    "room_under_incident_review",
    "coach_inactive",
    "coach_specialty_mismatch",
    "sport_inactive",
    "unknown_reason",
  ].entries()) {
    reason = key;
    await page
      .getByLabel(en.operations.numSessions, { exact: true })
      .fill(index % 2 === 0 ? "3" : "2");
    await expect(notice).toContainText(
      reasons[key as keyof typeof reasons] ?? reasons.unknown,
    );
    await expect(notice.locator("li")).toHaveCount(1);
    await expect(next).toBeDisabled();
  }
});

test("schedule stays blocked during checks and errors then retries without losing inputs", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failed = true;
  await page.route(
    "**/api/manager/class-schedule/availability?**",
    async (route) => {
      await gate;
      await route
        .fulfill(
          failed
            ? {
                status: 503,
                json: {
                  code: "unavailable",
                  message: "Internal transport failure",
                },
              }
            : {
                json: {
                  available: true,
                  roomName: "Court A",
                  coachName: "Coach",
                  reasons: [],
                },
              },
        )
        .catch(() => {});
    },
  );
  await fillDraft(page, false);
  const next = page.getByRole("button", {
    name: en.operations.next,
    exact: true,
  });
  const notice = page.locator('[class*="scheduleFeedback"][data-state]');
  await expect(notice).toContainText(
    en.managerOperations.scheduleValidation.checking,
  );
  await expect(next).toBeDisabled();
  await page.getByLabel(en.operations.start, { exact: true }).fill("20:00");
  await expect(next).toBeDisabled();
  release();
  await expect(notice).toContainText(
    en.managerOperations.scheduleValidation.checkFailed,
  );
  await expect(notice).not.toContainText("Internal transport failure");
  await expect(next).toBeDisabled();
  failed = false;
  await notice
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(next).toBeEnabled();
  await expect(
    page.getByLabel(en.operations.startDate, { exact: true }),
  ).toHaveValue("2030-10-03");
});

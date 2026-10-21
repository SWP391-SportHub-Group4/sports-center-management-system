import { expect, test, type Page } from "@playwright/test";

const coachId = "33333333-3333-4333-8333-333333333333";

const pendingRequest = () => ({
  requestId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  classId: 1,
  className: "Badminton group",
  sportId: 3,
  sessionNo: 1,
  coachId,
  coachName: "Coach",
  type: "SUBSTITUTE",
  status: "PENDING",
  reason: "Need a substitute coach",
  originalStartAtUtc: "2032-03-01T02:00:00Z",
  originalEndAtUtc: "2032-03-01T03:30:00Z",
  originalRoomId: 1,
  proposedStartAtUtc: null,
  proposedEndAtUtc: null,
  createdAtUtc: "2026-10-15T02:00:00Z",
  reviewedAtUtc: null,
  reviewNote: null as string | null,
  resolutionType: null as string | null,
  resultSessionId: null,
});

test("coach can only withdraw a pending request without editing its details", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  let current = pendingRequest();
  let withdrawals = 0;
  await page.route("**/api/coaches/me/teaching/change-requests**", (route) => {
    expect(route.request().method()).not.toBe("PUT");
    if (route.request().method() === "POST") {
      expect(route.request().url()).toContain(
        `/change-requests/${current.requestId}/withdraw`,
      );
      current = { ...current, status: "WITHDRAWN" };
      withdrawals++;
      return route.fulfill({ json: current });
    }
    return route.fulfill({
      json: { items: [current], totalCount: 1, page: 1, pageSize: 50 },
    });
  });
  await page.goto("/coach/change-requests");
  await expect(
    page.getByRole("button", { name: "Edit pending request", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel request", exact: true }),
  ).toHaveCount(0);
  expect(withdrawals).toBe(1);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Request details", exact: true })
      .getByText(current.reason, { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
});

test("requests never offer editing and only Pending requests offer withdrawal", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  const current = pendingRequest();
  await page.route("**/api/coaches/me/teaching/change-requests**", (route) =>
    route.fulfill({
      json: { items: [current], totalCount: 1, page: 1, pageSize: 50 },
    }),
  );
  for (const status of ["RESOLVED", "REJECTED", "WITHDRAWN", "PENDING"]) {
    current.status = status;
    if (status === "PENDING")
      current.originalStartAtUtc = "2020-01-01T02:00:00Z";
    await page.goto("/coach/change-requests");
    await expect(
      page.getByRole("heading", { name: "Badminton group", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit pending request", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel request", exact: true }),
    ).toHaveCount(status === "PENDING" ? 1 : 0);
  }
});

test("withdrawal reconciles a request already closed by Manager", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  const current = pendingRequest();
  await page.route("**/api/coaches/me/teaching/change-requests**", (route) => {
    if (route.request().method() === "POST") {
      current.status = "WITHDRAWN";
      current.resolutionType = "SCHEDULE_UPDATED";
      current.reviewNote =
        "Closed automatically — schedule updated by Manager.";
      return route.fulfill({
        status: 409,
        json: {
          error: "class_change_not_pending",
          message: "Class change not pending.",
        },
      });
    }
    return route.fulfill({
      json: { items: [current], totalCount: 1, page: 1, pageSize: 50 },
    });
  });
  await page.goto("/coach/change-requests");
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByText(current.reviewNote!, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit pending request", exact: true }),
  ).toHaveCount(0);
});
async function coachFixture(
  page: Page,
  sportIds: number[],
  isPersonalTrainer = false,
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "coach-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: coachId,
          fullName: "Coach",
          email: "coach@example.com",
          role: "COACH",
          sportIds,
          isPersonalTrainer,
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 1,
            name: "Gym",
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
        ],
      });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    if (path === "/api/coaches/me/classes") return route.fulfill({ json: [] });
    if (path === "/api/coaches/me/teaching/students")
      return route.fulfill({
        json: { items: [], sports: [], totalCount: 0, page: 1, pageSize: 12 },
      });
    if (path === "/api/coaches/me/students")
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 12 },
      });
    if (path === "/api/coach-member-relationships")
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
}

test("group-only coach uses a single navbar for teaching, classes and students", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  await page.goto("/coach");
  const navbar = page.getByRole("navigation");
  await expect(
    page.getByRole("link", { name: "Schedule", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Classes", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Students", exact: true }),
  ).toHaveCount(1);

  await navbar.getByRole("link", { name: "Schedule", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/schedule$/);
  await navbar.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/classes$/);
  await navbar.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/members$/);
  await expect(
    page.getByRole("heading", { name: "Your students", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No matching students", { exact: true }),
  ).toBeVisible();
});

test("manager updates show automatic closure instead of a coach withdrawal", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  const note = "Closed automatically — schedule updated by Manager.";
  await page.route("**/api/coaches/me/teaching/change-requests?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            requestId: "11111111-1111-4111-8111-111111111111",
            sessionId: "22222222-2222-4222-8222-222222222222",
            classId: 1,
            className: "Badminton group",
            sessionNo: 1,
            type: "RESCHEDULE",
            status: "WITHDRAWN",
            reason: "Need to change this slot",
            originalStartAtUtc: "2032-03-01T02:00:00Z",
            originalEndAtUtc: "2032-03-01T03:30:00Z",
            createdAtUtc: "2032-02-20T02:00:00Z",
            reviewedAtUtc: "2032-02-21T02:00:00Z",
            resolutionType: "SCHEDULE_UPDATED",
            reviewNote: note,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 50,
      },
    }),
  );
  await page.goto("/coach/change-requests");
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "You withdrew this request. Your teaching schedule is unchanged.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel request", exact: true }),
  ).toHaveCount(0);
});

test("revoked student access removes an already open health profile on focus", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  const memberId = "11111111-1111-4111-8111-111111111111";
  let revoked = false;
  await page.route(
    `**/api/coaches/me/teaching/students/${memberId}`,
    (route) =>
      revoked
        ? route.fulfill({
            status: 403,
            json: {
              error: "student_not_assigned",
              message: "Access is no longer available.",
            },
          })
        : route.fulfill({
            json: {
              memberId,
              memberName: "Assigned student",
              email: "student@example.com",
              classes: [
                {
                  classId: 1,
                  className: "Badminton group",
                  sportId: 3,
                  sportName: "Badminton",
                },
              ],
            },
          }),
  );
  await page.route(
    `**/api/coaches/me/teaching/students/${memberId}/health-profile`,
    (route) => route.fulfill({ json: { profile: null } }),
  );
  await page.goto(`/coach/members/${memberId}`);
  await expect(
    page.getByRole("heading", { name: "No Fitness profile yet", exact: true }),
  ).toBeVisible();
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Access is no longer available." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No Fitness profile yet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Assigned student", exact: true }),
  ).toHaveCount(0);
});

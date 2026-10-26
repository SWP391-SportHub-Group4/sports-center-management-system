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

test("coach sees upcoming classes and sessions first and AI only for a future session", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  await page.clock.setFixedTime(new Date("2026-10-26T03:00:00Z"));
  const course = {
    classId: 1,
    name: "Upcoming badminton",
    code: "UPCOMING",
    coachId,
    coachName: "Coach",
    sportId: 3,
    sportName: "Badminton",
    startDate: "2026-10-20",
    numSessions: 2,
    capacity: 12,
    price: 900000,
    roomName: "Court 1",
    defaultRoomId: 1,
    status: "IN_PROGRESS",
  };
  const sessions = [
    {
      sessionId: "66666666-6666-4666-8666-666666666661",
      classId: 1,
      sessionNo: 1,
      coachId,
      roomId: 1,
      roomName: "Court 1",
      startAtUtc: "2026-10-20T02:00:00Z",
      endAtUtc: "2026-10-20T04:00:00Z",
      status: "COMPLETED",
    },
    {
      sessionId: "66666666-6666-4666-8666-666666666662",
      classId: 1,
      sessionNo: 2,
      coachId,
      roomId: 1,
      roomName: "Court 1",
      startAtUtc: "2026-10-28T02:00:00Z",
      endAtUtc: "2026-10-28T04:00:00Z",
      status: "SCHEDULED",
    },
  ];
  const aiRequests: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/coaches/me/classes")
      return route.fulfill({
        json: [
          {
            ...course,
            classId: 2,
            name: "Past badminton",
            status: "COMPLETED",
            startDate: "2026-09-01",
          },
          course,
        ],
      });
    if (path === "/api/classes/1/sessions")
      return route.fulfill({ json: sessions });
    if (path === "/api/classes/2/sessions")
      return route.fulfill({
        json: [
          {
            ...sessions[0],
            classId: 2,
            sessionId: "77777777-7777-4777-8777-777777777777",
          },
        ],
      });
    if (path.endsWith("/members")) return route.fulfill({ json: [] });
    if (path.endsWith("/records"))
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
      });
    if (path.endsWith("/suggestion")) {
      aiRequests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          content: "Footwork · 3 sets × 12 reps",
          provider: "test",
          model: "test",
        },
      });
    }
    return route.fallback();
  });
  await page.goto("/coach/classes");
  const classes = page.getByRole("region", {
    name: "Your assigned classes",
    exact: true,
  });
  await expect(classes.getByRole("link").first()).toContainText(
    "Upcoming badminton",
  );
  await page.goto("/coach/classes/1?tab=plans");
  await expect(
    page.getByRole("button", { name: "New class roadmap", exact: true }),
  ).toHaveCount(0);
  const roadmap = page.getByRole("region", {
    name: "Full course roadmap",
    exact: true,
  });
  await expect(roadmap.locator("ol > li").first()).toContainText("Session 2");
  await roadmap
    .getByRole("button", { name: "Add session content", exact: true })
    .first()
    .click();
  const editor = page.getByRole("region", { name: "Lesson plan", exact: true });
  await expect(
    editor
      .getByRole("combobox", { name: "1. Plan scope", exact: true })
      .locator('option[value="course"]'),
  ).toHaveCount(0);
  await editor.getByText("AI lesson suggestions", { exact: true }).click();
  await editor
    .getByRole("textbox", { name: "Training goal", exact: true })
    .fill("Improve movement and control");
  await editor
    .getByRole("button", { name: "Generate suggestion", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Use this suggestion", exact: true }),
  ).toBeVisible();
  expect(aiRequests).toHaveLength(1);
  expect(aiRequests[0]).toMatchObject({
    scope: "session",
    sessionId: sessions[1].sessionId,
  });
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await roadmap
    .getByRole("button", { name: "Add session content", exact: true })
    .last()
    .click();
  await expect(
    editor.getByText("AI lesson suggestions", { exact: true }),
  ).toHaveCount(0);
});

for (const width of [1440, 320])
  test(`student directory is framed and pages ten members at ${width}px`, async ({
    page,
  }) => {
    await coachFixture(page, [3, 4]);
    await page.setViewportSize({ width, height: 1000 });
    const students = Array.from({ length: 21 }, (_, index) => ({
      memberId: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`,
      memberName: `Student ${String(index + 1).padStart(2, "0")}`,
      email: `student${index + 1}@example.test`,
      classes: [
        {
          classId: index + 1,
          className: "Assigned class",
          sportId: index % 2 ? 4 : 3,
          sportName: index % 2 ? "Basketball" : "Badminton",
        },
      ],
    }));
    await page.route("**/api/coaches/me/teaching/students**", (route) => {
      const query = new URL(route.request().url()).searchParams;
      const pageNumber = Number(query.get("page") || 1);
      const keyword = (query.get("search") || "").toLowerCase();
      const sport = query.get("sportId");
      const filtered = students.filter(
        (x) =>
          x.memberName.toLowerCase().includes(keyword) &&
          (!sport || String(x.classes[0].sportId) === sport),
      );
      return route.fulfill({
        json: {
          items: filtered.slice((pageNumber - 1) * 10, pageNumber * 10),
          page: pageNumber,
          pageSize: 10,
          totalCount: filtered.length,
          sports: [
            { sportId: 3, sportName: "Badminton" },
            { sportId: 4, sportName: "Basketball" },
          ],
        },
      });
    });
    await page.goto("/coach/members");
    const directory = page.getByRole("region", {
      name: "Student directory",
      exact: true,
    });
    const rows = directory
      .getByRole("list", { name: "Students", exact: true })
      .getByRole("listitem");
    await expect(rows).toHaveCount(10);
    await expect(
      directory.getByText("1–10 of 21 students", { exact: true }),
    ).toBeVisible();
    await directory
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(
      directory.getByText("11–20 of 21 students", { exact: true }),
    ).toBeVisible();
    await expect(rows).toHaveCount(10);
    await directory
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(rows).toHaveCount(1);
    await expect(
      directory.getByRole("link", { name: /Student 21/ }),
    ).toHaveAttribute("href", `/coach/members/${students[20].memberId}`);
    await expect(
      directory.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    await directory
      .getByRole("searchbox", { name: "Find a student", exact: true })
      .fill("Student 01");
    await expect(rows).toHaveCount(1);
    await expect(
      directory.getByText("1–1 of 1 student", { exact: true }),
    ).toBeVisible();
    await directory
      .getByRole("searchbox", { name: "Find a student", exact: true })
      .fill("");
    await directory
      .getByRole("combobox", { name: "Sport", exact: true })
      .selectOption("4");
    await expect(rows).toHaveCount(10);
    await expect(
      directory.getByText("1–10 of 10 students", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

for (const width of [1440, 320])
  test(`coach manages absence and member support in one request center at ${width}px`, async ({
    page,
  }) => {
    await coachFixture(page, [3]);
    await page.setViewportSize({ width, height: 1000 });
    const supportRequest = {
      requestId: "44444444-4444-4444-8444-444444444444",
      memberId: "55555555-5555-4555-8555-555555555555",
      memberName: "Member An",
      category: "CLASS",
      subject: "Member needs help",
      description: "Please explain my training plan.",
      status: "ASSIGNED",
      assignedToUserId: coachId,
      assignedToName: "Coach",
      createdAt: "2026-10-25T02:00:00Z",
      attachments: [],
    };
    await page.route("**/api/member-support-requests/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json: path.endsWith("/stats")
          ? {
              open: 0,
              assigned: 1,
              inProgress: 0,
              done: 0,
              rejected: 0,
              overdue: 0,
            }
          : path.endsWith("/queue")
            ? { items: [supportRequest], totalCount: 1, page: 1, pageSize: 20 }
            : path.endsWith("/events")
              ? []
              : supportRequest,
      });
    });
    await page.route("**/api/coaches/me/teaching/change-requests**", (route) =>
      route.fulfill({
        json: {
          items: [pendingRequest()],
          totalCount: 1,
          page: 1,
          pageSize: 50,
        },
      }),
    );
    await page.goto("/coach/support?type=absence");
    const absence = page.getByRole("tab", {
      name: "Absence requests",
      exact: true,
    });
    const support = page.getByRole("tab", {
      name: "Member support",
      exact: true,
    });
    await expect(absence).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("region", { name: "Request list", exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href="/coach/change-requests"]')).toHaveCount(
      0,
    );
    await support.click();
    await expect(support).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Member needs help", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(absence).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(absence).toHaveAttribute("aria-selected", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/coach/change-requests");
    await expect(page).toHaveURL(/\/coach\/support\?type=absence$/);
    await expect(absence).toHaveAttribute("aria-selected", "true");
    await page.goto(`/coach/support?request=${supportRequest.requestId}`);
    await expect(support).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Member needs help", exact: true }),
    ).toBeVisible();
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
        json: { items: [], sports: [], totalCount: 0, page: 1, pageSize: 10 },
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
    page.getByRole("heading", { name: "Student directory", exact: true }),
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

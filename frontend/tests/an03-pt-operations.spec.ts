import { expect, test, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";
const coachId = "22222222-2222-4222-8222-222222222222";
const otherCoachId = "99999999-9999-4999-8999-999999999999";
const entitlementId = "33333333-3333-4333-8333-333333333333";
const farSession = "44444444-4444-4444-8444-444444444444";
const lateSession = "55555555-5555-4555-8555-555555555555";
const requestId = "66666666-6666-4666-8666-666666666666";
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const session = (id: string, startH: number) => ({
  sessionId: id,
  entitlementId,
  memberId,
  memberName: "Alice",
  coachId,
  coachName: "Coach Minh",
  startAtUtc: hours(startH),
  endAtUtc: hours(startH + 1.5),
  status: "SCHEDULED",
  quotaState: "RESERVED",
  rescheduledFromSessionId: null,
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  roomId: 3,
  roomName: "Studio 2",
});

async function memberFixture(page: Page, opts: { pending?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() });
      return json({ ok: true });
    }
    if (path === "/api/users/me")
      return json({
        userId: memberId,
        email: "a@example.com",
        fullName: "Alice",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === "/api/members/me/pt-entitlements")
      return json([
        {
          entitlementId,
          coachId,
          coachName: "Coach Minh",
          status: "ACTIVE",
          totalQuota: 8,
          reservedSessions: 1,
          consumedSessions: 2,
          remainingQuota: 5,
          validityStartDate: "2030-01-01",
          validityEndDate: "2030-12-31",
          carryOverUntilDate: null,
        },
      ]);
    if (path === "/api/members/me/pt-sessions")
      return json([session(lateSession, 5), session(farSession, 72)]);
    if (path === "/api/members/me/pt-session-change-requests")
      return json(
        opts.pending
          ? [
              {
                requestId,
                sessionId: farSession,
                requestType: "CANCEL",
                status: "PENDING",
                reason: "Travelling",
                reviewNote: null,
                timingClassification: "ON_TIME",
              },
            ]
          : [],
      );
    if (path === "/api/members/me/pt-coach-change-requests") return json([]);
    if (path === "/api/members/me/homework")
      return json([
        {
          assignmentId: "h1",
          coachName: "Coach Minh",
          title: "Mobility routine",
          coachNote: "Ten minutes daily",
          dueAt: hours(48),
          status: "ASSIGNED",
          memberFeedback: null,
          version: 1,
          items: [
            {
              itemId: "i1",
              exercise: "Hip opener",
              sets: 2,
              reps: 10,
              notes: null,
            },
          ],
        },
      ]);
    if (path === "/api/members/me/training-profile")
      return json({
        goal: "Run 10 km",
        experienceLevel: "Beginner",
        notes: null,
        updatedAt: hours(-24),
      });
    if (path === "/api/sports")
      return json([
        {
          sportId: 1,
          code: "gym",
          name: "Gym",
          isActive: true,
          services: [
            {
              serviceType: "PERSONAL_TRAINING",
              isEnabled: true,
              defaultSessionMinutes: null,
              defaultMaxCapacity: null,
            },
          ],
        },
      ]);
    if (path === "/api/coaches")
      return json([
        { userId: coachId, fullName: "Coach Minh" },
        { userId: otherCoachId, fullName: "Coach Lan" },
      ]);
    if (path === "/api/members/me/packages") return json([]);
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
  return posts;
}

test("training page leads with the coach, quota and next session, and homework supports progress", async ({
  page,
}) => {
  await memberFixture(page);
  await page.goto("/member/training");
  await expect(page.getByText("Coach Minh").first()).toBeVisible();
  await expect(page.getByText("sessions left")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Details" }).first(),
  ).toHaveAttribute("href", `/member/pt/sessions/${lateSession}`);
  await page.getByRole("tab", { name: "Homework" }).click();
  await expect(page.getByText("Mobility routine")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete assignment", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Feedback for your coach")).toBeVisible();
  await page.getByRole("tab", { name: "Profile" }).click();
  await expect(page.getByLabel("Primary Training Goal")).toHaveValue(
    "Run 10 km",
  );
});

test("old profile address lands on the Profile tab", async ({ page }) => {
  await memberFixture(page);
  await page.goto("/member/profile");
  await expect(page).toHaveURL(/\/member\/training\?tab=profile$/);
});

test("a session more than 24 hours away sends a request and says the schedule is unchanged", async ({
  page,
}) => {
  const posts = await memberFixture(page);
  await page.goto(`/member/pt/sessions/${farSession}`);
  await expect(page.getByText(/up to 24 hours before it starts/)).toBeVisible();
  await page.getByRole("button", { name: "Request a change" }).click();
  await expect(page.getByLabel(/Ask for an exception/)).toHaveCount(0);
  await page.getByLabel("Move to another time").check();
  await page.getByLabel("New start time").fill("2031-01-05T18:00");
  await page.getByLabel("Reason").fill("Meeting");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe(
    `/api/members/me/pt-sessions/${farSession}/change-requests`,
  );
  expect(posts[0].body).toMatchObject({
    requestType: "RESCHEDULE",
    reason: "Meeting",
    requestsException: false,
    requestedStartAtUtc: new Date("2031-01-05T18:00+07:00").toISOString(),
  });
  await expect(
    page.getByText(/does not change until the center approves it/),
  ).toBeVisible();
});

test("a session under 24 hours away is a late request with an exception option", async ({
  page,
}) => {
  await memberFixture(page);
  await page.goto(`/member/pt/sessions/${lateSession}`);
  await expect(page.getByText(/under 24 hours/)).toBeVisible();
  await page.getByRole("button", { name: "Request a change" }).click();
  await expect(page.getByLabel(/Ask for an exception/)).toBeVisible();
});

test("a pending request blocks a second one and never shows an internal id", async ({
  page,
}) => {
  await memberFixture(page, { pending: true });
  await page.goto(`/member/pt/sessions/${farSession}`);
  await expect(
    page
      .getByText(
        "A request is waiting for review. Your schedule has not changed.",
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request a change" }),
  ).toHaveCount(0);
  await expect(page.getByText("Travelling")).toBeVisible();
  await expect(page.getByText(farSession)).toHaveCount(0);
});

test("changing coach opens only on demand and posts the chosen coach", async ({
  page,
}) => {
  const posts = await memberFixture(page);
  await page.goto("/member/services?tab=pt");
  await expect(page.getByLabel("New coach")).toHaveCount(0);
  await page.getByRole("button", { name: "Request a different coach" }).click();
  await page.getByLabel("New coach").selectOption(otherCoachId);
  await page.getByLabel("Reason").fill("Schedule fit");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].path).toBe(
    `/api/members/me/pt-entitlements/${entitlementId}/coach-change-requests`,
  );
  expect(posts[0].body).toEqual({
    requestedCoachId: otherCoachId,
    reason: "Schedule fit",
  });
});

async function managerFixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "m1",
        email: "m@example.com",
        fullName: "Manager",
        role: "CENTER_MANAGER",
        sportIds: [],
      });
    if (path === "/api/manager/pt-session-change-requests")
      return json([
        {
          requestId,
          memberId,
          memberName: "Alice",
          status: "PENDING",
          requestType: "CANCEL",
          timingClassification: "LATE",
          reason: "Sick",
        },
      ]);
    if (path === "/api/manager/pt-coach-change-requests") return json([]);
    if (path === "/api/users")
      return json({
        items: [
          {
            userId: memberId,
            fullName: "Alice",
            email: "a@example.com",
            phone: "0900000000",
            role: "MEMBER",
            status: "ACTIVE",
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      });
    if (path === `/api/users/${memberId}`)
      return json({
        userId: memberId,
        fullName: "Alice",
        email: "a@example.com",
        phone: "0900000000",
        role: "MEMBER",
        status: "ACTIVE",
      });
    if (path === `/api/members/${memberId}/packages`)
      return json([
        {
          memberPackageId: "p1",
          packageName: "Gym monthly",
          startDate: "2030-10-01",
          endDate: "2030-10-31",
          status: "ACTIVE",
          isUsable: true,
        },
      ]);
    if (path === "/api/manager/pt-entitlements")
      return json([
        {
          entitlementId,
          coachName: "Coach Minh",
          status: "ACTIVE",
          totalQuota: 8,
          remainingQuota: 5,
          validityStartDate: "2030-01-01",
          validityEndDate: "2030-12-31",
        },
      ]);
    if (path === "/api/coach-member-relationships")
      return json([
        {
          relationshipId: "r1",
          memberName: "Alice",
          coachName: "Coach Minh",
          status: "ACTIVE",
        },
      ]);
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
}

test("manager PT is one page with a pending count, and the old addresses redirect into its tabs", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/pt");
  await expect(page.getByRole("tab", { name: "Requests (1)" })).toBeVisible();
  await page.goto("/manager/pt-change-requests");
  await expect(page).toHaveURL(/\/manager\/pt\?tab=requests$/);
  await page.goto("/manager/coaching-relationships");
  await expect(page).toHaveURL(/\/manager\/pt\?tab=relationships$/);
  await page.goto("/manager/pt-sessions");
  await expect(page).toHaveURL(/\/manager\/pt\?tab=sessions$/);
});

test("manager reads a member's operations profile without any workout editing", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/members");
  await page.getByRole("link", { name: "Open profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/manager/members/${memberId}$`));
  await expect(page.getByText("Gym monthly")).toBeVisible();
  await expect(page.getByText("Coach Minh").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /plan|workout|homework/i }),
  ).toHaveCount(0);
});

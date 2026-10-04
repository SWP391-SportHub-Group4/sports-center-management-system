import { expect, test, type Page } from "@playwright/test";

const receptionistId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const enrollmentId = "44444444-4444-4444-8444-444444444444";
const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length });

async function receptionistFixture(page: Page) {
  await page.clock.install({ time: new Date("2030-10-03T03:00:00Z") });
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "receptionist-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({ json: { userId: receptionistId, fullName: "Receptionist", email: "desk@example.com", role: "RECEPTIONIST", sportIds: [] } });
    if (path.includes("notifications"))
      return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    if (path === "/api/sports")
      return route.fulfill({ json: [{ sportId: 3, name: "Badminton", operationType: "GROUP_COURSE", isActive: true }] });
    if (path === "/api/users")
      return route.fulfill({ json: paged([{ userId: memberId, fullName: "Member A", email: "member@example.com", phone: "0900000000", role: "MEMBER", status: "ACTIVE", createdAt: "2030-01-01T00:00:00Z", hasPassword: true, hasGoogleLink: false, sportIds: [] }]) });
    if (path === `/api/members/${memberId}/packages`)
      return route.fulfill({ json: [{ memberPackageId: "55555555-5555-4555-8555-555555555555", packageId: 1, packageName: "Gym monthly", startDate: "2030-10-01", endDate: "2030-10-31", status: "ACTIVE", isUsable: true }] });
    if (path === `/api/members/${memberId}/gym-checkins`)
      return route.fulfill({ json: paged([]) });
    if (path === "/api/gym-checkins/inside") return route.fulfill({ json: paged([]) });
    if (path === "/api/gym-checkins" && request.method() === "POST")
      return route.fulfill({ json: { checkInId: "66666666-6666-4666-8666-666666666666", memberId, checkInTime: "2030-10-03T03:00:00Z", checkOutTime: null } });
    if (path === "/api/invoices") return route.fulfill({ json: paged([]) });
    if (path === "/api/manager/court-schedule")
      return route.fulfill({ json: [{ sourceType: "CLASS_SESSION", sourceId: sessionId, classId: 7, title: "Badminton group", roomId: 3, coachId: "77777777-7777-4777-8777-777777777777", coachName: "Coach A", startAtUtc: "2030-10-03T02:30:00Z", endAtUtc: "2030-10-03T04:00:00Z" }] });
    if (path === `/api/class-sessions/${sessionId}/roster`)
      return route.fulfill({ json: { session: { sessionId, classId: 7, className: "Badminton group", sessionNo: 1, roomId: 3, roomName: "Court 3", coachId: "77777777-7777-4777-8777-777777777777", coachName: "Coach A", startAtUtc: "2030-10-03T02:30:00Z", endAtUtc: "2030-10-03T04:00:00Z", status: "SCHEDULED", isMakeup: false, rescheduledFromSessionId: null }, attendanceOpensAtUtc: "2030-10-03T02:30:00Z", attendanceClosesAtUtc: "2030-10-04T04:00:00Z", entries: [{ enrollmentId, memberId, memberName: "Member A", enrollmentStatus: "CONFIRMED", attendanceStatus: null, attendanceRecordedAt: null }] } });
    if (path === `/api/class-sessions/${sessionId}/attendance/${enrollmentId}` && request.method() === "PUT")
      return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: { code: "fixture_missing", message: `${request.method()} ${path}` } });
  });
}

test.beforeEach(async ({ page }) => receptionistFixture(page));

test("receptionist dashboard uses real operational links and no manual-paid workflow", async ({ page }) => {
  await page.goto("/receptionist");
  await expect(page.getByRole("heading", { name: "Operations overview", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gym check-in", exact: true }).first()).toHaveAttribute("href", "/receptionist/gym-checkin");
  await expect(page.getByText(/manual paid/i)).toHaveCount(0);
  await expect(page.getByText(/cash payout/i)).toHaveCount(0);
});

test("receptionist selects a Member and performs server-authorized Gym check-in", async ({ page }) => {
  let checkIns = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/gym-checkins") checkIns++;
  });
  await page.goto("/receptionist/gym-checkin");
  await page.getByLabel("Select Member").fill("Member A");
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Member A/ }).click();
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect.poll(() => checkIns).toBe(1);
});

test("only receptionist UI writes group attendance and uses enrollment+session identity", async ({ page }) => {
  let payload: unknown = null;
  await page.route(`**/api/class-sessions/${sessionId}/attendance/${enrollmentId}`, async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/receptionist/attendance");
  await page.getByLabel("Course registration").selectOption("7");
  await page.getByLabel("Sessions").selectOption(sessionId);
  await expect(page.getByText("Member A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect.poll(() => payload).toEqual({ status: "PRESENT" });
});

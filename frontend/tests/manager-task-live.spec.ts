import { expect, test } from "@playwright/test";
import { en } from "../src/locales/en";
import { bearer, liveApiBase } from "./helpers/api";
import { installBrowserSession, loginApi } from "./helpers/auth";
import type {
  SportDto,
  RoomTypeDto,
  ManagerCourseDto,
  CourseSessionDto,
} from "../src/lib/types";

// Writes must be explicitly enabled and directed to the disposable test API.
// Browser requests are forwarded to that real API; no responses are mocked.
test.beforeEach(async ({ page }) => {
  test.skip(
    process.env.P2_MANAGER_TASK_WRITES !== "1" ||
      liveApiBase !== "http://localhost:5201",
    "Requires the isolated manager-task.compose.yml API on port 5201.",
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${liveApiBase}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
});

test("live isolated settings save/reload and Admin audit reason", async ({
  page,
  request,
}) => {
  const manager = await loginApi(request, "manager@sporthub.vn");
  await installBrowserSession(page, manager.accessToken);
  const headers = bearer(manager.accessToken);
  const settings = await (
    await request.get(`${liveApiBase}/api/system-settings`, { headers })
  ).json();
  const oldValue = settings.find(
    (s: { key: string }) => s.key === "hold.minutes",
  ).value;
  await page.goto("/manager/settings");
  const row = page.getByRole("row").filter({
    has: page.getByLabel(en.settingFields.holdMinutes.label, { exact: true }),
  });
  await row.getByRole("spinbutton").fill(oldValue === "20" ? "21" : "20");
  await row
    .getByRole("button", { name: en.operations.save, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(en.operations.saved);
  await page.reload();
  await expect(row.getByRole("spinbutton")).toHaveValue(
    oldValue === "20" ? "21" : "20",
  );
  await row.getByRole("spinbutton").fill(oldValue);
  await row
    .getByRole("button", { name: en.operations.save, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(en.operations.saved);
  const admin = await loginApi(request, "admin@sporthub.vn");
  const adminHeaders = bearer(admin.accessToken);
  const coaches = await (
    await request.get(`${liveApiBase}/api/coaches?sportId=3`, { headers })
  ).json();
  const target = coaches[0].userId;
  const reason = "Manager task acceptance: verify account audit reason";
  const locked = await request.post(`${liveApiBase}/api/users/${target}/lock`, {
    headers: adminHeaders,
    data: { reason },
  });
  expect(locked.ok(), await locked.text()).toBeTruthy();
  const unlocked = await request.post(
    `${liveApiBase}/api/users/${target}/unlock`,
    {
      headers: adminHeaders,
      data: { reason: "Acceptance cleanup: restore coach" },
    },
  );
  expect(unlocked.ok(), await unlocked.text()).toBeTruthy();
  await installBrowserSession(page, admin.accessToken);
  await page.goto("/admin/audit-log?action=LOCK_USER_ACCOUNT");
  await expect(page.getByRole("table")).toContainText(reason);
  await expect(page.getByRole("table").locator("del").first()).toHaveText(
    "Active",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/manager-task-admin-audit-live.png",
    fullPage: true,
  });
});

test("live isolated draft/edit/publish/reschedule/makeup/cancel refunds paid enrollment once", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const manager = await loginApi(request, "manager@sporthub.vn");
  const headers = bearer(manager.accessToken);
  await installBrowserSession(page, manager.accessToken);
  const sports = (await (
    await request.get(`${liveApiBase}/api/manager/sports`, { headers })
  ).json()) as SportDto[];
  const sport = sports.find((s) => s.code === "badminton")!;
  const types = (await (
    await request.get(`${liveApiBase}/api/room-types`, { headers })
  ).json()) as RoomTypeDto[];
  const roomTypeId = types.find((r) =>
    r.sportIds.includes(sport.sportId),
  )!.roomTypeId;
  const coaches = await (
    await request.get(`${liveApiBase}/api/coaches?sportId=${sport.sportId}`, {
      headers,
    })
  ).json();
  const coachId = coaches[0].userId;
  const suffix = Date.now().toString();
  const createdRoom = await request.post(`${liveApiBase}/api/rooms`, {
    headers,
    data: { name: `Acceptance court ${suffix}`, capacity: 20, roomTypeId },
  });
  expect(createdRoom.ok(), await createdRoom.text()).toBeTruthy();
  const room = await createdRoom.json();
  const hours = await request.put(
    `${liveApiBase}/api/manager/rooms/${room.roomId}/opening-hours`,
    {
      headers,
      data: {
        hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          openTimeLocal: "06:00",
          closeTimeLocal: "22:00",
        })),
      },
    },
  );
  expect(hours.ok(), await hours.text()).toBeTruthy();
  await page.goto("/manager/classes/new");
  await page
    .getByLabel(en.operations.code, { exact: true })
    .fill(`ACCEPT-${suffix}`);
  await page
    .getByLabel(en.operations.name, { exact: true })
    .fill(`Acceptance course ${suffix}`);
  await page
    .getByLabel(en.operations.sport, { exact: true })
    .selectOption(String(sport.sportId));
  const next = () =>
    page.getByRole("button", { name: en.operations.next, exact: true }).click();
  await next();
  await page
    .getByLabel(en.operations.coach, { exact: true })
    .selectOption(coachId);
  await page
    .getByLabel(en.operations.room, { exact: true })
    .selectOption(String(room.roomId));
  await page
    .getByLabel(en.operations.startDate, { exact: true })
    .fill("2032-03-01");
  await page.getByLabel(en.operations.day, { exact: true }).selectOption("1");
  await page.getByLabel(en.operations.start, { exact: false }).fill("09:00");
  await page.getByLabel(en.operations.numSessions, { exact: true }).fill("3");
  await next();
  await page.getByLabel(en.operations.price, { exact: true }).fill("1000");
  await page.getByLabel(en.operations.cost, { exact: true }).fill("0");
  await next();
  await expect(
    page.getByText(coaches[0].fullName, { exact: false }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft, exact: true })
    .click();
  await expect(page).toHaveURL(/\/manager\/classes\/\d+$/);
  const classId = Number(new URL(page.url()).pathname.split("/").pop());
  await page
    .getByRole("link", { name: en.operations.edit, exact: true })
    .click();
  await page
    .getByLabel(en.operations.name, { exact: true })
    .fill(`Acceptance edited ${suffix}`);
  await next();
  await next();
  await next();
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/manager/classes/${classId}$`));
  await page
    .getByRole("button", { name: en.operations.publish, exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: en.operations.confirm, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const member = await loginApi(request, "an.member@sporthub.vn");
  const memberHeaders = bearer(member.accessToken);
  const walletBefore = await (
    await request.get(`${liveApiBase}/api/wallet/me`, {
      headers: memberHeaders,
    })
  ).json();
  const checkoutResponse = await request.post(
    `${liveApiBase}/api/checkouts/class`,
    {
      headers: { ...memberHeaders, "Idempotency-Key": `accept-${suffix}` },
      data: { classId },
    },
  );
  expect(checkoutResponse.ok(), await checkoutResponse.text()).toBeTruthy();
  const checkout = await checkoutResponse.json();
  const selection = await request.post(
    `${liveApiBase}/api/wallet/me/checkouts/${checkout.invoiceId}/points`,
    { headers: memberHeaders, data: { points: 1 } },
  );
  expect(selection.ok(), await selection.text()).toBeTruthy();
  const paid = await request.post(
    `${liveApiBase}/api/checkouts/${checkout.invoiceId}/confirm-points`,
    { headers: memberHeaders },
  );
  expect(paid.ok(), await paid.text()).toBeTruthy();
  let sessions = (await (
    await request.get(`${liveApiBase}/api/classes/${classId}/sessions`, {
      headers,
    })
  ).json()) as CourseSessionDto[];
  const first = sessions[0].sessionId;
  async function changeSession(
    mode: "reschedule" | "cancel",
    start: string,
    reason: string,
  ) {
    await page.goto(`/manager/classes/${classId}?tab=sessions`);
    await page
      .getByRole("row")
      .filter({ hasText: room.name })
      .first()
      .getByRole("button", { name: en.operations.edit, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel(en.operations.edit, { exact: true })
      .selectOption(mode);
    await dialog.getByLabel(en.operations.start, { exact: true }).fill(start);
    await dialog.getByLabel(en.operations.reason, { exact: true }).fill(reason);
    await dialog
      .getByRole("button", { name: en.managerOperations.reviewChange })
      .click();
    await expect(
      dialog.getByRole("button", { name: en.operations.confirm, exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByText(
        new RegExp(`${en.managerOperations.newSchedule}.*${room.name}`),
      ),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: en.operations.confirm, exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  await changeSession(
    "reschedule",
    "2032-03-02T09:00",
    "Acceptance move to Tuesday",
  );
  sessions = await (
    await request.get(`${liveApiBase}/api/classes/${classId}/sessions`, {
      headers,
    })
  ).json();
  expect(sessions.find((s) => s.sessionId === first)?.startAtUtc).toBe(
    "2032-03-02T02:00:00Z",
  );
  await changeSession(
    "cancel",
    "2032-03-22T09:00",
    "Acceptance cancellation with makeup",
  );
  sessions = await (
    await request.get(`${liveApiBase}/api/classes/${classId}/sessions`, {
      headers,
    })
  ).json();
  expect(sessions.some((s) => s.isMakeup)).toBeTruthy();
  await page.goto(`/manager/classes/${classId}`);
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Acceptance cancel entire course");
  await page
    .getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    })
    .click();
  await expect(
    page.getByText(`${en.operations.refundTotal}: 1`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    }),
  ).toHaveCount(0);
  const cancelled = (await (
    await request.get(`${liveApiBase}/api/manager/classes/${classId}`, {
      headers,
    })
  ).json()) as ManagerCourseDto;
  expect(cancelled.status).toBe("CANCELLED");
  const walletAfter = await (
    await request.get(`${liveApiBase}/api/wallet/me`, {
      headers: memberHeaders,
    })
  ).json();
  expect(walletAfter.availablePoints).toBe(walletBefore.availablePoints);
  const repeat = await request.post(
    `${liveApiBase}/api/manager/classes/${classId}/cancel`,
    { headers, data: { reason: "Acceptance repeated cancellation" } },
  );
  expect(repeat.ok(), await repeat.text()).toBeTruthy();
  expect(
    (
      await (
        await request.get(`${liveApiBase}/api/wallet/me`, {
          headers: memberHeaders,
        })
      ).json()
    ).availablePoints,
  ).toBe(walletAfter.availablePoints);
  await page.goto(`/manager/audit-log?targetEntity=Class`);
  await expect(
    page.locator(`table a[href='/manager/classes/${classId}']`).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/manager-task-class-audit-live.png",
    fullPage: true,
  });
});

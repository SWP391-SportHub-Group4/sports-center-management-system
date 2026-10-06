import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { loginApi } from "./helpers/auth";

// Opt in only against a freshly seeded, isolated test database.
const base = process.env.P2_LIVE_API;
test.skip(!base, "Set P2_LIVE_API for an isolated test API.");
test.describe.configure({ mode: "serial" });

const login = (request: APIRequestContext, email: string) =>
  loginApi(request, email);
async function browserAuth(page: Page, token: string) {
  await page.addInitScript((accessToken) => {
    localStorage.setItem("sporthub.accessToken", accessToken);
    localStorage.setItem("sporthub_lang", "en");
  }, token);
}

test("paid course cancellation from Manager UI refunds the real wallet once", async ({
  page,
  request,
}) => {
  const manager = await login(request, "manager@sporthub.vn");
  const member = await login(request, "an.member@sporthub.vn");
  const headers = { Authorization: `Bearer ${manager.accessToken}` };
  const memberHeaders = { Authorization: `Bearer ${member.accessToken}` };
  const sports = await (await request.get(`${base}/api/sports`)).json();
  const sport = sports.find(
    (s: { services: { serviceType: string; isEnabled: boolean }[] }) =>
      s.services.some((x) => x.serviceType === "GROUP_COURSE" && x.isEnabled),
  );
  const coaches = await (
    await request.get(`${base}/api/coaches?sportId=${sport.sportId}`, {
      headers,
    })
  ).json();
  const template = (
    await (
      await request.get(`${base}/api/classes?sportId=${sport.sportId}`)
    ).json()
  ).items[0];
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 360);
  const created = await request.post(`${base}/api/manager/classes`, {
    headers,
    data: {
      code: `P2-cancel-${Date.now()}`,
      name: "P2 live cancellation",
      sportId: sport.sportId,
      coachId: coaches[0].userId,
      defaultRoomId: template.defaultRoomId,
      startDate: date.toISOString().slice(0, 10),
      numSessions: 3,
      capacity: 8,
      price: 100000,
      costAmount: 0,
      scheduleRules: [{ dayOfWeek: date.getUTCDay(), startTimeLocal: "10:00" }],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const course = await created.json();
  const publish = await request.post(
    `${base}/api/manager/classes/${course.classId}/publish`,
    { headers, data: {} },
  );
  expect(publish.ok(), await publish.text()).toBeTruthy();
  const before = await (
    await request.get(`${base}/api/wallet/me`, { headers: memberHeaders })
  ).json();
  const checkout = await request.post(`${base}/api/checkouts/class`, {
    headers: { ...memberHeaders, "Idempotency-Key": crypto.randomUUID() },
    data: { classId: course.classId },
  });
  expect(checkout.ok(), await checkout.text()).toBeTruthy();
  const { invoiceId } = await checkout.json();
  const selection = await request.post(
    `${base}/api/wallet/me/checkouts/${invoiceId}/points`,
    { headers: memberHeaders, data: { points: 100 } },
  );
  expect(selection.ok(), await selection.text()).toBeTruthy();
  const paid = await request.post(
    `${base}/api/checkouts/${invoiceId}/confirm-points`,
    { headers: memberHeaders },
  );
  expect(paid.ok(), await paid.text()).toBeTruthy();
  await browserAuth(page, manager.accessToken);
  await page.goto(`/manager/classes/${course.classId}`);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Enrollments", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  const cancellation = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "Cancel", exact: true }),
  });
  await cancellation
    .getByLabel("Reason", { exact: true })
    .fill("Center cancels this course");
  await cancellation
    .getByRole("button", { name: "Preview course cancellation" })
    .click();
  await expect(cancellation).toContainText(
    "Estimated total refund points: 100",
  );
  await cancellation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${base}/api/manager/classes/${course.classId}`, {
              headers,
            })
          ).json()
        ).status,
    )
    .toBe("CANCELLED");
  const after = await (
    await request.get(`${base}/api/wallet/me`, { headers: memberHeaders })
  ).json();
  expect(after.availablePoints).toBe(before.availablePoints);
  expect(after.heldPoints).toBe(0);
  await page.reload();
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Enrollments", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("manual notice UI uses a real receipt and restores delivery after F5", async ({
  page,
  request,
}) => {
  const manager = await login(request, "manager@sporthub.vn");
  await browserAuth(page, manager.accessToken);
  await page.goto("/manager/notices");
  await page.getByRole("checkbox", { name: "Phạm Minh Cầu Lông" }).check();
  await page.getByLabel("Subject", { exact: true }).fill("P2 isolated notice");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Test the real in-app notification receipt.");
  await page
    .getByRole("checkbox", { name: "Send email", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Send notice", exact: true }).click();
  await expect(page).toHaveURL(/noticeId=/);
  const noticeId = new URL(page.url()).searchParams.get("noticeId");
  const receipt = await request.get(`${base}/api/manager/notices/${noticeId}`, {
    headers: { Authorization: `Bearer ${manager.accessToken}` },
  });
  expect(receipt.ok(), await receipt.text()).toBeTruthy();
  expect((await receipt.json()).delivery.total).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Notification delivery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Failed", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

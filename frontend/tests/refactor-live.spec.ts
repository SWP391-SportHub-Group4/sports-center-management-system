import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginApi } from "./helpers/auth";
import type {
  CourseDto,
  CheckoutDto,
  PaymentAttemptDto,
} from "../src/lib/types";
const base = process.env.P2_LIVE_API;
test.skip(
  !base,
  "Set P2_LIVE_API only for an isolated, freshly seeded test database.",
);
test.describe.configure({ mode: "serial" });
const login = (request: APIRequestContext, email: string) =>
  loginApi(request, email);
for (const points of [0, 50, 200])
  test(`real course checkout ${points} points, F5 and server fulfillment`, async ({
    page,
    request,
  }) => {
    const member = await login(request, "an.member@sporthub.vn");
    const staff = await login(request, "letan@sporthub.vn");
    const manager = await login(request, "manager@sporthub.vn");
    const headers = { Authorization: `Bearer ${manager.accessToken}` };
    const sports = await (await request.get(`${base}/api/sports`)).json();
    const sport = sports.find(
      (s: { operationType: string }) => s.operationType === "GROUP_COURSE",
    );
    const coaches = await (
      await request.get(`${base}/api/coaches?sportId=${sport.sportId}`, {
        headers,
      })
    ).json();
    const rooms = await (
      await request.get(`${base}/api/rooms`, { headers })
    ).json();
    const courseTemplate = (
      await (
        await request.get(`${base}/api/classes?sportId=${sport.sportId}`)
      ).json()
    ).items[0] as CourseDto;
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 40 + points);
    const startDate = date.toISOString().slice(0, 10);
    const created = await request.post(`${base}/api/manager/classes`, {
      headers,
      data: {
        code: `P2-${points}-${Date.now()}`,
        name: `P2 checkout ${points}`,
        sportId: sport.sportId,
        coachId: coaches[0].userId,
        defaultRoomId: rooms.find(
          (r: { roomId: number }) => r.roomId === courseTemplate.defaultRoomId,
        ).roomId,
        startDate,
        numSessions: 1,
        capacity: 8,
        price: 200000,
        costAmount: 100000,
        scheduleRules: [
          { dayOfWeek: date.getUTCDay(), startTimeLocal: "10:00" },
        ],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const course = await created.json();
    const published = await request.post(
      `${base}/api/manager/classes/${course.classId}/publish`,
      { headers, data: {} },
    );
    expect(published.ok(), await published.text()).toBeTruthy();
    await page.addInitScript((token) => {
      localStorage.setItem("sporthub.accessToken", token);
      localStorage.setItem("sporthub_lang", "en");
    }, member.accessToken);
    let attempts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/attempts")) attempts++;
    });
    await page.goto(`/courses/${course.classId}`);
    await page.getByRole("button", { name: "Checkout", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Confirm payment", exact: true }),
    ).toBeVisible();
    // Sau khi tạo đơn, URL chuyển sang /checkout/[invoiceId].
    await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/i);
    const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
    expect(invoiceId).toBeTruthy();
    if (points > 0) {
      await page.getByLabel("Points", { exact: true }).fill(String(points));
      await page
        .getByRole("button", { name: "Apply points", exact: true })
        .click();
      await expect
        .poll(async () => {
          const response = await request.get(
            `${base}/api/checkouts/${invoiceId}`,
            { headers: { Authorization: `Bearer ${member.accessToken}` } },
          );
          return (await response.json()).pointsApplied;
        })
        .toBe(points);
    }
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Confirm payment", exact: true }),
    ).toBeVisible();
    const attemptPromise =
      points < 200
        ? page.waitForResponse(
            (r) =>
              r.request().method() === "POST" && r.url().endsWith("/attempts"),
          )
        : null;
    await page
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    if (points < 200) {
      const attempt = await attemptPromise;
      if (attempt) {
        const data = (await attempt.json()) as PaymentAttemptDto;
        expect(data.cashAmount).toBe(200000 - points * 1000);
        expect(data.gatewayMode).toBe("MOCK");
        const paid = await request.post(
          `${base}/api/dev/payments/${data.transactionReference}/simulate`,
          { headers: { Authorization: `Bearer ${staff.accessToken}` } },
        );
        expect(paid.ok(), await paid.text()).toBeTruthy();
      } else throw new Error("Payment attempt response missing");
    }
    await expect(
      page.getByText("Payment verified by server", { exact: true }),
    ).toBeVisible();
    if (points === 200) expect(attempts).toBe(0);
    const status = await request.get(`${base}/api/checkouts/${invoiceId}`, {
      headers: { Authorization: `Bearer ${member.accessToken}` },
    });
    const snapshot = (await status.json()) as CheckoutDto;
    expect(snapshot.invoiceStatus).toBe("PAID");
    expect(snapshot.fulfillmentOutcome).toBe("FULFILLED");
    const enrollments = await (
      await request.get(`${base}/api/members/me/enrollments?pageSize=100`, {
        headers: { Authorization: `Bearer ${member.accessToken}` },
      })
    ).json();
    expect(
      enrollments.items.some(
        (e: { classId: number }) => e.classId === course.classId,
      ),
    ).toBeTruthy();
    await page.reload();
    await expect(
      page.getByText("Payment verified by server", { exact: true }),
    ).toBeVisible();
  });
test("real Member views and responsive public catalog", async ({
  page,
  request,
}) => {
  const member = await login(request, "an.member@sporthub.vn");
  await page.addInitScript((token) => {
    localStorage.setItem("sporthub.accessToken", token);
    localStorage.setItem("sporthub_lang", "en");
  }, member.accessToken);
  for (const path of [
    "/member",
    "/member/class-schedule",
    "/member/my-registrations",
    "/member/my-plans",
    "/member/invoices",
    "/member/training",
    "/member/wallet",
  ]) {
    await page.goto(path);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator("#main-content [role=alert]")).toHaveCount(0);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/p2-public-live-${width}.png`,
      fullPage: true,
    });
  }
});

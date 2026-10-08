import { expect, test, type Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function install(page: Page, opts: { aiFailsFirst?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const chats: unknown[] = [];
  let failed = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === "/api/users/me")
      return json({
        userId,
        email: "a@example.com",
        fullName: "Alice",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === "/api/members/me/packages")
      return json([
        {
          memberPackageId: "p1",
          packageId: 1,
          packageName: "Gym monthly",
          startDate: isoDay(-10),
          endDate: isoDay(20),
          status: "ACTIVE",
          isUsable: true,
        },
      ]);
    if (path === "/api/members/me/pt-entitlements")
      return json([
        {
          entitlementId: "e1",
          coachId: "c1",
          coachName: "Coach Minh",
          status: "ACTIVE",
          totalQuota: 8,
          reservedSessions: 1,
          consumedSessions: 2,
          remainingQuota: 5,
          validityStartDate: isoDay(-10),
          validityEndDate: isoDay(100),
        },
      ]);
    if (path === "/api/class-threshold-responses/mine")
      return json([
        {
          responseId: "r1",
          classId: 7,
          className: "Badminton foundations",
          sportId: 3,
          paidValueVnd: 600000,
          deadlineUtc: hours(30),
          choice: null,
          targetClassId: null,
          resolutionStatus: "PENDING",
          additionalInvoiceId: null,
          serverNowUtc: new Date().toISOString(),
        },
      ]);
    if (path === "/api/members/me/gym-checkins")
      return json({
        items: [
          {
            checkInId: "g1",
            memberId: userId,
            checkInTime: hours(-1),
            checkOutTime: null,
            checkedInByUserId: "r1",
            checkedOutByUserId: null,
          },
        ],
        page: 1,
        pageSize: 3,
        totalCount: 1,
      });
    if (path === "/api/wallet/me")
      return json({ availablePoints: 320, heldPoints: 0, vndPerPoint: 1000 });
    if (path === "/api/ai/chat") {
      const body = request.postDataJSON();
      if (opts.aiFailsFirst && !failed) {
        failed = true;
        return json({ error: "ai_provider_failed", message: "down" }, 502);
      }
      chats.push(body);
      return json({
        logId: "l1",
        interactionId: `i-${chats.length}`,
        question: body.question,
        answer:
          chats.length === 1
            ? "You have Badminton foundations at 18:00 today.\nBring a racket."
            : "Your Gym membership ends in 20 days.",
        provider: "test",
        model: "test",
        promptVersion: "1",
        responseTimeMs: 12,
        createdAt: new Date().toISOString(),
      });
    }
    if (path === "/api/members/me/invoices")
      return json({ items: [], page: 1, pageSize: 5, totalCount: 0 });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
  return chats;
}

test("dashboard surfaces what needs a reply, the Gym and PT status and a way to book", async ({
  page,
}) => {
  await install(page);
  await page.goto("/member");

  // Việc cần phản hồi có hạn: lớp dưới ngưỡng dẫn tới đúng trang chọn phương án.
  const attention = page.getByRole("region", { name: "Needs your attention" });
  await expect(attention).toContainText(
    "Badminton foundations is below its minimum",
  );
  await expect(attention.getByRole("link", { name: /Choose/ })).toHaveAttribute(
    "href",
    "/member/threshold-responses/r1",
  );

  // Membership: còn bao nhiêu ngày và đang ở trong Gym.
  await expect(page.getByText(/\d+ days left/)).toBeVisible();
  await expect(page.getByText(/Checked in at the Gym since/)).toBeVisible();

  // PT: quota và lối đặt buổi.
  await expect(
    page.getByRole("link", { name: "Book a session" }),
  ).toHaveAttribute("href", "/member/pt/book");
});

test("dashboard separates today's sessions from the next day", async ({ page }) => {
  await install(page);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDay = tomorrow.toISOString().slice(0, 10);
  await page.route("**/api/members/me/schedule?**", (route) =>
    route.fulfill({
      json: [
        {
          sessionId: "today-class",
          className: "Today's badminton",
          startAtUtc: new Date(`${today}T18:00:00+07:00`).toISOString(),
          endAtUtc: new Date(`${today}T20:00:00+07:00`).toISOString(),
          roomName: "Court A",
          status: "SCHEDULED",
        },
        {
          sessionId: "next-class",
          className: "Tomorrow's basketball",
          startAtUtc: new Date(`${nextDay}T09:00:00+07:00`).toISOString(),
          endAtUtc: new Date(`${nextDay}T11:00:00+07:00`).toISOString(),
          roomName: "Court B",
          status: "SCHEDULED",
        },
      ],
    }),
  );
  await page.goto("/member");
  const schedule = page.getByRole("region", { name: "My schedule" });
  await expect(schedule.getByText("Today's badminton")).toBeVisible();
  await expect(schedule.getByText("Tomorrow's basketball")).toBeVisible();
  await expect(schedule.getByText("Today's schedule")).toBeVisible();
});

test("the assistant answers from a suggestion, keeps the thread and offers links", async ({
  page,
}) => {
  const chats = await install(page);
  await page.goto("/member");
  await page.getByRole("button", { name: "Ask SportHub" }).click();
  const drawer = page.getByRole("dialog", { name: "SportHub assistant" });
  await expect(drawer).toContainText("cannot book, pay or change anything");

  await drawer.getByRole("button", { name: "What do I have today?" }).click();
  await expect(
    drawer.getByText(/Badminton foundations at 18:00 today/),
  ).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "My schedule" }),
  ).toHaveAttribute("href", "/member/schedule");
  expect(chats[0]).toMatchObject({
    question: "What do I have today?",
    previousInteractionId: null,
  });

  // Câu hỏi tiếp theo mang theo mã cuộc trò chuyện.
  await drawer.getByLabel("Your question").fill("When does my membership end?");
  await drawer.getByRole("button", { name: "Send" }).click();
  await expect(
    drawer.getByText("Your Gym membership ends in 20 days."),
  ).toBeVisible();
  expect(chats[1]).toMatchObject({ previousInteractionId: "i-1" });

  // Cuộc trò chuyện mới xóa luồng và mã cũ.
  await drawer.getByRole("button", { name: "New conversation" }).click();
  await expect(drawer.getByText(/Badminton foundations at 18:00/)).toHaveCount(
    0,
  );
  await expect(
    drawer.getByRole("button", { name: "What do I have today?" }),
  ).toBeVisible();
});

test("an unavailable assistant explains itself and a retry succeeds without a second user message", async ({
  page,
}) => {
  const chats = await install(page, { aiFailsFirst: true });
  await page.goto("/member");
  await page.getByRole("button", { name: "Ask SportHub" }).click();
  const drawer = page.getByRole("dialog", { name: "SportHub assistant" });
  await drawer.getByRole("button", { name: "What do I have today?" }).click();
  await expect(drawer.getByRole("alert")).toContainText(
    "not available right now",
  );
  await drawer.getByRole("button", { name: "Try again" }).click();
  await expect(
    drawer.getByText(/Badminton foundations at 18:00 today/),
  ).toBeVisible();
  await expect(
    drawer.getByText("What do I have today?", { exact: true }),
  ).toHaveCount(1);
  expect(chats).toHaveLength(1);
});

test("the assistant never renders markup from an answer", async ({ page }) => {
  await install(page);
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      json: {
        logId: "l",
        interactionId: "i",
        question: "q",
        answer: "<img src=x onerror=window.__pwned=1><b>bold</b>",
        provider: "t",
        model: "t",
        promptVersion: "1",
        responseTimeMs: 1,
        createdAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/member");
  await page.getByRole("button", { name: "Ask SportHub" }).click();
  const drawer = page.getByRole("dialog", { name: "SportHub assistant" });
  await drawer.getByRole("button", { name: "What do I have today?" }).click();
  await expect(drawer.getByText("<b>bold</b>", { exact: false })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __pwned?: number }).__pwned,
    ),
  ).toBeUndefined();
});

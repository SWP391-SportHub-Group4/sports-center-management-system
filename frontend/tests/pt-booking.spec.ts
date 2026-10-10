import { expect, test, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";
const entitlementId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";

// Giờ địa phương Việt Nam (UTC+7) → ISO UTC cho một ngày cách hôm nay `days` ngày.
const vnToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
const slotAt = (days: number, hour: number, minute = 0) => {
  const [y, m, d] = vnToday().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d + days, hour - 7, minute));
  return {
    startAtUtc: start.toISOString(),
    endAtUtc: new Date(start.getTime() + 90 * 60_000).toISOString(),
    rooms: [
      { roomId: 3, name: "Studio A" },
      { roomId: 4, name: "Studio B" },
    ],
  };
};

async function install(
  page: Page,
  opts: {
    reason?: string | null;
    noPackage?: boolean;
    conflictOnBook?: boolean;
  } = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const requests: { path: string; query: string; body: unknown }[] = [];
  let slots = [slotAt(2, 9), slotAt(2, 10, 30), slotAt(4, 18)];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (path === "/api/users/me")
      return json({
        userId: memberId,
        email: "a@example.com",
        fullName: "Alice",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === "/api/members/me/pt-entitlements")
      return json(
        opts.noPackage
          ? []
          : [
              {
                entitlementId,
                coachId: "c1",
                coachName: "Coach Minh",
                status: "ACTIVE",
                totalQuota: 8,
                reservedSessions: 1,
                consumedSessions: 2,
                remainingQuota: 5,
                validityStartDate: "2030-01-01",
                validityEndDate: "2031-12-31",
                carryOverUntilDate: null,
              },
            ],
      );
    if (
      path === `/api/members/me/pt-entitlements/${entitlementId}/availability`
    ) {
      requests.push({ path, query: url.search, body: null });
      return json({
        entitlementId,
        coachId: "c1",
        coachName: "Coach Minh",
        sessionMinutes: 90,
        remainingQuota: opts.reason === "pt_quota_exhausted" ? 0 : 5,
        bookableReason: opts.reason ?? null,
        policy: {
          minLeadHours: 12,
          advanceDays: 30,
          stepMinutes: 30,
          changeDeadlineHours: 24,
        },
        slots: opts.reason ? [] : slots,
      });
    }
    if (path === "/api/members/me/pt-sessions" && request.method() === "POST") {
      requests.push({ path, query: "", body: request.postDataJSON() });
      if (opts.conflictOnBook) {
        slots = slots.slice(1); // khung đầu vừa bị người khác đặt
        return json({ error: "pt_slot_unavailable", message: "gone" }, 409);
      }
      return json({
        sessionId,
        entitlementId,
        memberId,
        memberName: "Alice",
        coachId: "c1",
        coachName: "Coach Minh",
        startAtUtc: slots[0].startAtUtc,
        endAtUtc: slots[0].endAtUtc,
        status: "SCHEDULED",
        quotaState: "RESERVED",
        rescheduledFromSessionId: null,
        completedAt: null,
        cancelledAt: null,
        cancellationReason: null,
        roomId: 3,
        roomName: "Studio A",
      });
    }
    if (path === "/api/members/me/pt-sessions")
      return json([
        {
          sessionId,
          entitlementId,
          memberId,
          memberName: "Alice",
          coachId: "c1",
          coachName: "Coach Minh",
          startAtUtc: slots[0].startAtUtc,
          endAtUtc: slots[0].endAtUtc,
          status: "SCHEDULED",
          quotaState: "RESERVED",
          rescheduledFromSessionId: null,
          roomId: 3,
          roomName: "Studio A",
        },
      ]);
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
  return requests;
}

test("a member picks a free day and time, confirms, and lands on the booked session", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("/member/training?tab=book");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Training",
  );
  await expect(page.getByText("5 sessions left in your package")).toBeVisible();
  await expect(
    page.getByText(/at least 12 hours ahead and up to 30 days/),
  ).toBeVisible();

  // Chỉ hiện giờ do server trả; ngày không có giờ trống bị khóa.
  await expect(page.getByText("2 free")).toBeVisible();
  await expect(page.getByText("1 free")).toBeVisible();
  await expect(page.getByRole("button", { name: "09:00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "10:30" })).toBeVisible();
  await expect(page.getByRole("button", { name: "18:00" })).toHaveCount(0);

  await page.getByRole("button", { name: "10:30" }).click();
  const form = page.getByRole("form", { name: "Your booking" });
  await expect(form).toContainText("10:30 – 12:00");
  await expect(form).toContainText("Coach Minh");
  await expect(form).toContainText("4 sessions left after this booking");
  await form.getByLabel("Room").selectOption("4");
  await form.getByRole("button", { name: "Book this session" }).click();

  await expect
    .poll(() => requests.some((r) => r.path === "/api/members/me/pt-sessions"))
    .toBe(true);
  const post = requests.find((r) => r.path === "/api/members/me/pt-sessions")!;
  expect(post.body).toMatchObject({ entitlementId, roomId: 4 });
  expect((post.body as { startAtUtc: string }).startAtUtc).toBe(
    slotAt(2, 10, 30).startAtUtc,
  );

  await expect(page).toHaveURL(
    new RegExp(`/member/training\\?session=${sessionId}&booked=1$`),
  );
  await expect(
    page.getByRole("heading", { name: "Session booked" }),
  ).toBeVisible();
});

test("when the time was just taken the list refreshes and nothing is booked", async ({
  page,
}) => {
  const requests = await install(page, { conflictOnBook: true });
  await page.goto("/member/training?tab=book");
  await page.getByRole("button", { name: "09:00" }).click();
  await page.getByRole("button", { name: "Book this session" }).click();
  await expect(page.getByText(/That time was just taken/)).toBeVisible();
  await expect(page).toHaveURL(/\/member\/training\?tab=book$/);
  // Danh sách được tải lại: 09:00 không còn.
  await expect(page.getByRole("button", { name: "09:00" })).toHaveCount(0);
  expect(
    requests.filter((r) => r.path.endsWith("/availability")).length,
  ).toBeGreaterThanOrEqual(2);
});

test("an exhausted package explains why and offers new packages instead of times", async ({
  page,
}) => {
  await install(page, { reason: "pt_quota_exhausted" });
  await page.goto("/member/training?tab=book");
  await expect(
    page.getByText("You have used all sessions in this package."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View PT packages" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^\d\d:\d\d$/ })).toHaveCount(
    0,
  );
});

test("without an active package the page offers a Gym membership", async ({
  page,
}) => {
  await install(page, { noPackage: true });
  await page.goto("/member/training?tab=book");
  await expect(
    page.getByText("You need an active Gym membership to book PT."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose a membership" }))
    .toHaveAttribute("href", "/member/services");
});

test("the training page offers booking when sessions remain", async ({
  page,
}) => {
  await install(page);
  await page.goto("/member/training");
  await expect(
    page.getByRole("link", { name: "Book a session" }),
  ).toHaveAttribute("href", "/member/training?tab=book");
});

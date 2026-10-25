import { expect, test, type Page } from "@playwright/test";

const managerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const noticeId = "55555555-5555-4555-8555-555555555555";
const unrelatedDescription =
  "Please check the damaged treadmill near the entrance.";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(
  page: Page,
  kind: "sla" | "payout",
  state: "open" | "closed" | "legacy" | "missing" = "open",
) {
  let read = false;
  const writes: string[] = [];
  const queries: string[] = [];
  const target = {
    requestId,
    memberId,
    recordedByUserId: memberId,
    category: kind === "payout" ? "PAYMENT" : "FACILITY",
    subject:
      kind === "payout" ? "Transfer not received" : "Locker repair follow-up",
    description:
      kind === "payout"
        ? "The refund transfer has not arrived in my bank account."
        : "The locker remains broken and I have not received an update.",
    status: state === "closed" ? "DONE" : "OPEN",
    channel: "ONLINE",
    createdAt: "2026-10-20T01:00:00Z",
    slaDueAtUtc:
      kind === "payout" ? "2026-10-27T01:00:00Z" : "2026-10-22T01:00:00Z",
    isOverdue: kind === "sla" && state !== "closed",
    remindCount: 0,
    assignedToUserId: null,
    assignedToName: null,
    memberName: "Alex Member",
    memberEmail: "member@example.test",
    progressNote:
      state === "closed"
        ? "The locker was repaired and the member was informed."
        : null,
    invoiceId:
      kind === "payout" ? "66666666-6666-4666-8666-666666666666" : null,
    payout:
      kind === "payout"
        ? {
            payoutId: "payout",
            amount: 50000,
            recordedAtUtc: "2026-10-24T01:00:00Z",
            memberConfirmedAtUtc: null,
            memberConfirmedBy: null,
            proofAttachmentIds: ["proof"],
          }
        : null,
    attachments:
      kind === "payout"
        ? [
            {
              attachmentId: "proof",
              fileName: "transfer.png",
              kind: "PAYOUT_PROOF",
            },
          ]
        : [],
  };
  const unrelated = {
    ...target,
    requestId: otherId,
    subject: "A different request",
    description: unrelatedDescription,
    status: "OPEN",
    isOverdue: true,
    slaDueAtUtc: "2026-10-22T01:00:00Z",
    progressNote: null,
    invoiceId: null,
    category: "FACILITY",
    payout: null,
    attachments: [],
  };
  const actionUrl = `/manager/requests?type=support${kind === "sla" ? "&overdue=1" : ""}${state === "legacy" ? "" : `&request=${requestId}`}`;
  const notice = () => ({
    notificationId: noticeId,
    sourceEventType:
      kind === "sla" ? "SUPPORT_SLA_REMINDER" : "SUPPORT_PAYOUT_NOT_RECEIVED",
    sourceEntityId: "77777777-7777-4777-8777-777777777777",
    sentAt: "2026-10-25T01:00:00Z",
    status: read ? "READ" : "PENDING",
    actionUrl,
    message:
      kind === "sla"
        ? "Support request Locker repair follow-up is overdue. Please review it."
        : "A member reported that the refund payout was not received. Please review the original transfer.",
  });
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-support-notices");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/users/me")
      return json({
        userId: managerId,
        fullName: "Center Manager",
        email: "manager@example.test",
        role: "CENTER_MANAGER",
        sportIds: [],
      });
    if (path === "/api/notifications/unread-count")
      return json({ count: read ? 0 : 1 });
    if (path === "/api/notifications") return json([notice()]);
    if (path === "/api/notifications/inbox")
      return json({ items: [notice()], totalCount: 1, page: 1, pageSize: 25 });
    if (path === `/api/notifications/${noticeId}`) return json(notice());
    if (path === `/api/notifications/${noticeId}/read`) {
      read = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/manager/requests/summary") return json({ support: 2 });
    if (path === "/api/member-support-requests/stats")
      return json({
        notStarted: 0,
        open: 2,
        assigned: 0,
        inProgress: 0,
        done: 1,
        rejected: 0,
        overdue: 1,
      });
    if (path === "/api/member-support-requests/assignees")
      return json([
        { userId: managerId, name: "Center Manager", role: "CenterManager" },
      ]);
    if (path === "/api/member-support-requests/queue") {
      queries.push(url.search);
      return json({ items: [unrelated], totalCount: 1, page: 1, pageSize: 20 });
    }
    if (path === `/api/member-support-requests/${requestId}`)
      return state === "missing"
        ? route.fulfill({
            status: 404,
            json: {
              error: "support_request_not_found",
              message: "Support request not found.",
            },
          })
        : json(target);
    if (path.endsWith("/events"))
      return json(
        kind === "payout"
          ? [
              {
                eventId: "report",
                type: "MEMBER_REPORTED_NOT_RECEIVED",
                note: null,
                createdAt: "2026-10-25T01:00:00Z",
                actorName: "Alex Member",
                actorRole: "Member",
                targetName: null,
              },
            ]
          : [],
      );
    if (path === `/api/users/${memberId}`)
      return json({
        userId: memberId,
        fullName: "Alex Member",
        email: "member@example.test",
        role: "MEMBER",
        status: "ACTIVE",
        phone: "0901234567",
      });
    if (path === "/api/support/attachments/proof")
      return route.fulfill({ contentType: "image/png", body: png });
    return json([]);
  });
  return { target, actionUrl, writes, queries, read: () => read };
}

for (const width of [1440, 390]) {
  for (const kind of ["sla", "payout"] as const) {
    test(`manager opens ${kind} notification at ${width}px and lands on the exact request outside the list`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await fixture(page, kind);
      await page.goto("/notifications");
      await page
        .getByRole("button", { name: "Notifications (1)", exact: true })
        .click();
      await page
        .getByRole("banner")
        .locator(`a[href="/notifications?message=${noticeId}"]`)
        .click();
      const reader = page.getByRole("region", {
        name: "Message reader",
        exact: true,
      });
      const cta = reader.getByRole("link", {
        name:
          kind === "sla" ? "Review overdue request" : "Review payout request",
      });
      await expect(cta).toHaveAttribute("href", state.actionUrl);
      await expect(
        reader.getByRole("heading", {
          name:
            kind === "sla"
              ? "A support request is overdue"
              : "A member reported a missing payout",
        }),
      ).toBeVisible();
      await expect.poll(state.read).toBe(true);
      await cta.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.tmp/manager-support-notifications/inbox-${kind}-${width}.png`,
      });
      await cta.click();
      await expect(page).toHaveURL(state.actionUrl);
      await expect(
        page.getByRole("tab", { name: /Member support/ }),
      ).toHaveAttribute("aria-selected", "true");
      const detail = page.getByRole("region", {
        name: "Support request details",
        exact: true,
      });
      await expect(detail).toContainText(state.target.description);
      await expect(detail).not.toContainText(unrelatedDescription);
      const linked = detail.getByRole("region", {
        name: "Linked support request",
      });
      await expect(linked).toContainText("Request 33333333");
      await expect(linked).toContainText("outside the current list");
      if (kind === "sla") {
        await expect(
          page.getByRole("button", { name: /Overdue/ }).first(),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
          state.queries.some((query) => query.includes("overdue=true")),
        ).toBe(true);
      } else
        await expect(detail).toContainText(
          "Member reported not received. Awaiting manager review.",
        );
      if (width === 390) await expect(linked).toBeInViewport();
      await linked.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.tmp/manager-support-notifications/request-${kind}-${width}.png`,
      });
      expect(
        state.writes.filter((path) =>
          path.startsWith("/api/member-support-requests/"),
        ),
      ).toEqual([]);
      await linked
        .getByRole("button", { name: "View all support requests" })
        .click();
      await expect(page).not.toHaveURL(/request=/);
      await expect(linked).toHaveCount(0);
      await page.goBack();
      await expect(linked).toContainText("Request 33333333");
    });
  }
}

test("an old SLA notice opens the final outcome even when the request is no longer overdue", async ({
  page,
}) => {
  const state = await fixture(page, "sla", "closed");
  await page.goto(`/notifications?message=${noticeId}`);
  await page.getByRole("link", { name: "Review overdue request" }).click();
  const detail = page.getByRole("region", {
    name: "Support request details",
    exact: true,
  });
  await expect(detail).toContainText(
    "This request has already been finalized.",
  );
  await expect(detail).toContainText(state.target.progressNote!);
  await expect(
    detail.getByRole("region", { name: "Handle request" }),
  ).toHaveCount(0);
  await detail
    .getByRole("region", { name: "Linked support request" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../.tmp/manager-support-notifications/request-finalized.png",
  });
  await detail
    .getByRole("region", { name: "Reply visible to member" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../.tmp/manager-support-notifications/request-finalized-outcome.png",
  });
});

test("legacy payout notice explains its queue fallback", async ({ page }) => {
  await fixture(page, "payout", "legacy");
  await page.goto(`/notifications?message=${noticeId}`);
  await expect(
    page.getByText(
      "This older notice has no request link. Open the queue to find the request.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open support queue" }).click();
  await expect(page).toHaveURL("/manager/requests?type=support");
});

test("an unavailable linked request shows recovery instead of an unrelated request", async ({
  page,
}) => {
  await fixture(page, "sla", "missing");
  await page.goto(`/notifications?message=${noticeId}`);
  await page.getByRole("link", { name: "Review overdue request" }).click();
  const detail = page.getByRole("region", {
    name: "Support request details",
    exact: true,
  });
  await expect(
    detail.getByRole("heading", { name: "This request couldn’t open" }),
  ).toBeVisible();
  await expect(detail).not.toContainText(unrelatedDescription);
  await detail.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../.tmp/manager-support-notifications/request-unavailable.png",
  });
  await detail
    .getByRole("button", { name: "View all support requests" })
    .click();
  await expect(detail).toContainText(unrelatedDescription);
});

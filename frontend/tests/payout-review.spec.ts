import { expect, test, type Page } from "@playwright/test";

const requestId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const managerId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(page: Page) {
  let role = "CENTER_MANAGER";
  let failNext = true;
  const writes: string[] = [];
  const reads: string[] = [];
  const payout = {
    payoutId: "55555555-5555-4555-8555-555555555555",
    amount: 50000,
    recordedAtUtc: "2026-10-20T01:00:00Z",
    memberConfirmedAtUtc: null as string | null,
    memberConfirmedBy: null as string | null,
    proofAttachmentIds: ["original-proof"],
  };
  const row = {
    requestId,
    memberId,
    recordedByUserId: memberId,
    category: "PAYMENT",
    subject: "Refund has not arrived",
    description: "I checked my account but the transfer has not arrived.",
    status: "OPEN",
    createdAt: "2026-10-20T00:00:00Z",
    updatedAt: null,
    slaDueAtUtc: "2026-10-27T01:00:00Z",
    isOverdue: false,
    remindCount: 0,
    closedAt: null as string | null,
    assignedToUserId: null as string | null,
    assignedToName: null as string | null,
    progressNote: null as string | null,
    memberName: "Alex Member",
    memberEmail: "member@example.test",
    channel: "ONLINE",
    invoiceId,
    attachments: [
      {
        attachmentId: "original-proof",
        fileName: "original-proof.png",
        kind: "PAYOUT_PROOF",
      },
    ],
    payout,
  };
  const events = [
    {
      eventId: "reported",
      type: "MEMBER_REPORTED_NOT_RECEIVED",
      note: null as string | null,
      createdAt: "2026-10-25T01:00:00Z",
      actorName: "Alex Member",
      actorRole: "Member",
      targetName: null,
    },
  ];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "payout-review-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (request.method() === "GET") reads.push(path);
    else writes.push(path);
    if (path === "/api/users/me")
      return json({
        userId: role === "MEMBER" ? memberId : managerId,
        fullName: role === "MEMBER" ? "Alex Member" : "Center Manager",
        email: "review@example.test",
        role,
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/wallet/me")
      return json({ availablePoints: 0, pendingPoints: 0 });
    if (path === "/api/manager/requests/summary") return json({ support: 1 });
    if (path === "/api/member-support-requests/stats")
      return json({
        notStarted: 0,
        open: 1,
        assigned: 0,
        inProgress: 0,
        done: 0,
        rejected: 0,
        overdue: 0,
      });
    if (path === "/api/member-support-requests/assignees")
      return json([
        { userId: managerId, name: "Center Manager", role: "CenterManager" },
      ]);
    if (path === "/api/member-support-requests/queue")
      return json({ items: [row], totalCount: 1, page: 1, pageSize: 20 });
    if (path === `/api/member-support-requests/${requestId}`) return json(row);
    if (path === `/api/member-support-requests/${requestId}/events`)
      return json(events);
    if (path === `/api/users/${memberId}`)
      return json({
        userId: memberId,
        fullName: "Alex Member",
        email: "member@example.test",
        phone: "0901234567",
        role: "MEMBER",
        status: "ACTIVE",
      });
    if (path === "/api/support/requests/mine")
      return json([
        {
          ...row,
          response: row.progressNote,
          canRemindAtUtc: "2026-10-27T01:00:00Z",
        },
      ]);
    if (path === "/api/support/attachments/original-proof")
      return route.fulfill({ contentType: "image/png", body: png });
    if (path === `/api/support/requests/${requestId}/confirm-received`) {
      payout.memberConfirmedAtUtc = new Date().toISOString();
      payout.memberConfirmedBy = "MEMBER";
      row.status = "CLOSED";
      return json({ ...payout, status: row.status });
    }
    if (path.endsWith("/done") || path.endsWith("/reject")) {
      const { reason } = request.postDataJSON();
      expect(reason.trim().length).toBeGreaterThanOrEqual(3);
      if (failNext) {
        failNext = false;
        return route.fulfill({
          status: 503,
          json: {
            error: "temporary_error",
            message: "Could not save the review. Please try again.",
          },
        });
      }
      row.status = path.endsWith("/done") ? "DONE" : "REJECTED";
      row.progressNote = reason;
      row.assignedToUserId = managerId;
      row.assignedToName = "Center Manager";
      row.closedAt = "2026-10-25T02:00:00Z";
      events.push({
        eventId: "finished",
        type: row.status,
        note: reason,
        createdAt: row.closedAt,
        actorName: "Center Manager",
        actorRole: "CenterManager",
        targetName: null,
      });
      return json(row);
    }
    return json([]);
  });
  return {
    writes,
    reads,
    payout,
    asMember: () => {
      role = "MEMBER";
    },
  };
}

test("member can confirm a delayed transfer while its review is open", async ({
  page,
}) => {
  const state = await fixture(page);
  state.asMember();
  await page.goto(`/member/help?tab=requests&requestId=${requestId}`);
  const detail = page.getByRole("article", { name: "Request details" });
  await expect(detail).toContainText("Our manager is checking it");
  await expect(
    detail.getByRole("button", { name: "Not received", exact: true }),
  ).toHaveCount(0);
  await detail
    .getByRole("button", { name: "I received it", exact: true })
    .click();
  await expect(detail).toContainText("You confirmed receipt");
  expect(state.writes).toContain(
    `/api/support/requests/${requestId}/confirm-received`,
  );
});

for (const width of [1440, 390]) {
  for (const action of ["done", "reject"] as const) {
    test(`payout review ${action} at ${width}px preserves the transfer and shows the outcome to the member`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await fixture(page);
      const original = JSON.stringify(state.payout);
      await page.goto(`/manager/requests?type=support&request=${requestId}`);
      await expect(
        page.getByText(
          "Member reported not received. Awaiting manager review.",
        ),
      ).toBeVisible();
      const handling = page.getByRole("region", { name: "Handle request" });
      await expect(
        handling.getByText("Review the reported payout"),
      ).toBeVisible();
      await handling
        .getByRole("tab", {
          name: action === "done" ? "Mark as done" : "Reject",
          exact: true,
        })
        .click();
      const submit = handling.getByRole("button", {
        name: action === "done" ? "Mark as done" : "Reject request",
        exact: true,
      });
      await expect(submit).toBeDisabled();
      const note = handling.getByRole("textbox");
      const reason =
        action === "done"
          ? "Completed the bank trace and explained the transfer result to the member."
          : "Declined the claim after reviewing the original transfer and contacting the member.";
      await note.fill(reason);
      await expect(submit).toBeEnabled();
      await handling.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.tmp/payout-review/manager-${action}-${width}.png`,
      });
      await submit.click();
      const confirm = handling.getByRole("button", {
        name: action === "done" ? "Confirm done" : "Confirm rejection",
        exact: true,
      });
      await confirm.click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Could not save the review" }),
      ).toBeVisible();
      await expect(note).toHaveValue(reason);
      await confirm.click();
      await expect(handling).toHaveCount(0);
      await expect(
        page.getByText(
          action === "done"
            ? "Payout review completed. Receipt has not been confirmed by the member."
            : "Payout claim declined. Receipt has not been confirmed by the member.",
        ),
      ).toBeVisible();
      expect(JSON.stringify(state.payout)).toBe(original);
      expect(
        state.writes.filter((path) =>
          path.startsWith("/api/member-support-requests/"),
        ),
      ).toEqual([
        `/api/member-support-requests/${requestId}/${action}`,
        `/api/member-support-requests/${requestId}/${action}`,
      ]);
      expect(state.reads.some((path) => path.endsWith("/bank-details"))).toBe(
        false,
      );
      state.asMember();
      await page.goto(`/member/help?tab=requests&requestId=${requestId}`);
      const detail = page.getByRole("article", { name: "Request details" });
      await expect(detail).toContainText(reason);
      await expect(detail).toContainText(
        "This does not confirm that you received the transfer.",
      );
      await expect(
        detail.getByRole("button", { name: "Not received", exact: true }),
      ).toHaveCount(0);
      await expect(
        detail.getByRole("button", { name: "I received it", exact: true }),
      ).toHaveCount(0);
      await expect(detail.getByRole("list", { name: "Progress" })).toHaveCount(
        0,
      );
      await expect(
        detail.getByRole("button", { name: "View Transfer proof 1" }),
      ).toBeVisible();
      await detail.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.tmp/payout-review/member-${action}-${width}.png`,
      });
    });
  }
}

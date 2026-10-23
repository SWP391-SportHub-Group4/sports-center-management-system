import { expect, test, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const itemId = "44444444-4444-4444-8444-444444444444";
const requestId = "66666666-6666-4666-8666-666666666666";

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

const items = [
  {
    invoiceItemId: itemId,
    itemType: "Membership",
    description: "Gym 3 months",
    invoiceNumber: "INV-0042",
    paidAt: "2030-10-01T02:00:00Z",
    lineAmount: 1000000,
    remainingRefundableVnd: 1000000,
    eligible: true,
    ineligibleReason: null,
  },
  {
    invoiceItemId: "77777777-7777-4777-8777-777777777777",
    itemType: "Membership",
    description: "Gym day pass",
    invoiceNumber: "INV-0043",
    paidAt: "2030-10-01T02:00:00Z",
    lineAmount: 50000,
    remainingRefundableVnd: 50000,
    eligible: false,
    ineligibleReason: "Gym day passes cannot be refunded.",
  },
];

function view(status: string) {
  const awaiting = status === "APPROVED_AWAITING_PAYOUT";
  return {
    bankRefundId: "88888888-8888-4888-8888-888888888888",
    supportRequestId: requestId,
    status,
    ticketStatus: status === "PENDING" ? "OPEN" : status,
    memberId,
    memberName: "Alice",
    account: {
      bankName: "Vietcombank",
      accountNumber: "0123456789",
      accountHolder: "NGUYEN VAN A",
      masked: false,
    },
    service: {
      invoiceItemId: itemId,
      itemType: "Membership",
      description: "Gym 3 months",
      invoiceId: "33333333-3333-4333-8333-333333333333",
      invoiceNumber: "INV-0042",
      invoicePaidAt: "2030-10-01T02:00:00Z",
      lineAmount: 1000000,
      paidCashVnd: 1000000,
      paidPointsVnd: 0,
      paidTotalVnd: 1000000,
      priorPointRefundVnd: 0,
      priorBankRefundVnd: 0,
      remainingRefundableVnd: 1000000,
      entitlementStatus: "Active",
      startDate: "2030-10-01",
      endDate: "2030-12-30",
      startAtUtc: null,
      endAtUtc: null,
      unitLabel: "days",
      totalUnits: 91,
      usedUnits: 11,
      unusedUnits: 80,
      notes: [],
      priorRefunds: [],
    },
    policy: {
      percent: 50,
      suggestedVnd: 500000,
      basis: "At least two thirds of the term remained at request time: 50%.",
      centerFaultPercent: 87.9121,
      centerFaultSuggestedVnd: 879121,
      centerFaultBasis: "Center fault: unused part of the term.",
      evaluatedAtUtc: "2030-10-11T02:00:00Z",
      disclaimer:
        "This amount is a policy suggestion, not an automatic decision.",
    },
    approvedAmount: awaiting ? 500000 : null,
    centerFault: false,
    approvalReason: awaiting ? "Policy: 50% of the unused term" : null,
    approvedAt: awaiting ? "2030-10-11T03:00:00Z" : null,
    approvedByName: awaiting ? "Manager" : null,
    payout: null,
    needsReconciliation: false,
    reconciliationNote: null,
    rejectionReason: null,
    rejectedAt: null,
    createdAt: "2030-10-11T02:00:00Z",
    frozen: false,
  };
}

async function signIn(page: Page, role: "MEMBER" | "CENTER_MANAGER") {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "token");
    localStorage.setItem("sporthub_lang", "en");
  });
  return role;
}

test("member must pick a transaction, enter the account and attach evidence before a Payment request can be sent", async ({
  page,
}) => {
  await signIn(page, "MEMBER");
  let posted: string | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: memberId,
        email: "alice@example.com",
        fullName: "Alice",
        role: "MEMBER",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/bank-refunds/items") return json(items);
    if (path === "/api/support/requests" && request.method() === "POST") {
      posted = request.postData() ?? "";
      return json({ requestId, reference: "66666666", status: "OPEN" });
    }
    if (path === "/api/support/requests/mine") return json([]);
    return json([]);
  });

  await page.goto(`/member/help?topic=PAYMENT&itemId=${itemId}`);
  await expect(
    page.getByText(/review a refund to your bank account/),
  ).toBeVisible();
  // The transaction passed from the cancel dialog is already selected, and unavailable items cannot be chosen.
  await expect(page.getByLabel(/Transaction to refund/)).toHaveValue(itemId);
  await expect(
    page.getByRole("option", { name: /day pass.*not available/ }),
  ).toHaveAttribute("disabled", "");

  await page.getByLabel("Subject *").fill("Refund to my account");
  await page
    .getByLabel("Your message *")
    .fill("Please refund this membership.");
  await page.getByLabel(/I agree/).check();
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();

  await page.getByLabel(/Bank \*/).fill("Vietcombank");
  await page.getByLabel(/Account number \*/).fill("0123 456 789");
  await page.getByLabel(/Account holder name \*/).fill("NGUYEN VAN A");
  await expect(send).toBeDisabled(); // evidence still missing

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText("Request received")).toBeVisible();
  expect(posted).toContain('name="invoiceItemId"');
  expect(posted).toContain(itemId);
  expect(posted).toContain("0123456789"); // spaces removed before sending
  expect(posted).toContain('name="files"');
});

test("manager approves with a reason, then must record the transfer with a receipt before the ticket can be refunded", async ({
  page,
}) => {
  await signIn(page, "CENTER_MANAGER");
  let status = "PENDING";
  const posts: { path: string; body: string }[] = [];
  const ticket = () => ({
    requestId,
    memberId,
    recordedByUserId: memberId,
    category: "PAYMENT",
    subject: "Refund to my account",
    description: "Please refund this membership.",
    status: status === "PENDING" ? "OPEN" : status,
    createdAt: "2030-10-11T02:00:00Z",
    assignedToUserId: null,
    memberName: "Alice",
    memberEmail: "alice@example.com",
    progressNote: null,
    updatedAt: null,
    closedAt: null,
    attachments: [],
    channel: "ONLINE",
    requiresPayout: true,
    assigneeCanAct: true,
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: managerId,
        email: "m@example.com",
        fullName: "Manager",
        role: "CENTER_MANAGER",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (request.method() === "POST") {
      posts.push({ path, body: request.postData() ?? "" });
      if (path.endsWith("/approve")) status = "APPROVED_AWAITING_PAYOUT";
      if (path.endsWith("/complete")) status = "PAID";
      return json(view(status));
    }
    if (path === "/api/manager/requests/summary")
      return json({
        coach: 0,
        refunds: 0,
        support: 1,
        payment: 1,
        awaitingPayout: 0,
      });
    if (path === "/api/member-support-requests/stats")
      return json({
        open: 1,
        assigned: 0,
        inProgress: 0,
        approvedAwaitingPayout: 0,
        done: 0,
        rejected: 0,
      });
    if (path === "/api/member-support-requests/queue")
      return json({
        items: [ticket()],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      });
    if (path === "/api/member-support-requests/assignees") return json([]);
    if (path.startsWith("/api/bank-refunds/by-request/"))
      return json(view(status));
    if (path.endsWith("/events")) return json([]);
    if (path.startsWith("/api/users/")) return json({ userId: memberId });
    return json([]);
  });

  await page.goto("/manager/requests?type=support");
  await expect(
    page.getByRole("heading", { name: "Policy suggestion" }),
  ).toBeVisible();
  await expect(page.getByText("500.000 ₫").first()).toBeVisible();
  await expect(page.getByText(/not an automatic decision/)).toBeVisible();

  // Approval needs a reason; the suggested amount is prefilled.
  const approve = page.getByRole("button", {
    name: "Approve refund",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await page.getByLabel("Reason", { exact: true }).fill("Policy: 50%");
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Record the bank transfer")).toBeVisible();
  expect(posts[0].path).toContain("/approve");
  expect(JSON.parse(posts[0].body)).toMatchObject({ amount: 500000 });

  // Marking as refunded needs the amount, a reason, a receipt image and the confirmation tick.
  const done = page.getByRole("button", { name: "Mark as refunded" });
  await expect(done).toBeDisabled();
  await page
    .getByLabel(/Reason for the refund/)
    .fill("Refund per policy: unused membership term.");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(done).toBeDisabled();
  await page.getByLabel(/I have already transferred/).check();
  await expect(done).toBeEnabled();
  await done.click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].path).toContain("/complete");
  expect(posts[1].body).toContain('name="completionKey"');
  expect(posts[1].body).toContain('name="payoutAmount"');
  await expect(
    page.getByText("Refunded to bank account").first(),
  ).toBeVisible();
});

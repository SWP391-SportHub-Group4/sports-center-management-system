import { expect, test, type Page } from "@playwright/test";

const requestId = "a1111111-1111-4111-8111-111111111111";
const memberId = "b2222222-2222-4222-8222-222222222222";
const invoiceId = "c3333333-3333-4333-8333-333333333333";
const staffId = "d4444444-4444-4444-8444-444444444444";
const managerId = "e5555555-5555-4555-8555-555555555555";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(page: Page, role: "RECEPTIONIST" | "CENTER_MANAGER") {
  let paid = false;
  let reported = false;
  let payoutBody = "";
  const followUpQueries: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "support-f4-f5");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    const row = {
      requestId,
      memberId,
      recordedByUserId: memberId,
      category: "PAYMENT",
      subject: "Payment: service was not activated",
      description: "Payment needs support",
      status: reported ? "OPEN" : paid ? "CLOSED" : "OPEN",
      createdAt: "2026-10-20T01:00:00Z",
      slaDueAtUtc: "2026-10-22T01:00:00Z",
      isOverdue: !paid,
      remindCount: 1,
      updatedAt: null,
      closedAt: paid ? "2026-10-24T01:00:00Z" : null,
      assignedToUserId: null,
      memberName: "Member An",
      memberEmail: "an@example.com",
      assignedToName: null,
      progressNote: null,
      channel: "ONLINE",
      invoiceId,
      attachments: paid
        ? [
            {
              attachmentId: "proof-1",
              fileName: "transfer.png",
              kind: "PAYOUT_PROOF",
            },
          ]
        : [],
      payout: paid
        ? {
            payoutId: "payout-1",
            amount: 50000,
            recordedAtUtc: "2026-10-24T01:00:00Z",
            memberConfirmedAtUtc: null,
            memberConfirmedBy: null,
            proofAttachmentIds: ["proof-1"],
          }
        : null,
    };
    if (path === "/api/users/me")
      return json({
        userId: staffId,
        role,
        fullName: "Staff",
        email: "staff@example.com",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/manager/requests/summary") return json({ support: 1 });
    if (path === "/api/member-support-requests/stats")
      return json({
        open: paid ? 0 : 1,
        assigned: 0,
        inProgress: 0,
        overdue: paid ? 0 : 1,
        done: paid ? 1 : 0,
        rejected: 0,
      });
    if (path === "/api/member-support-requests/assignees")
      return json([
        { userId: staffId, name: "Staff", role },
        ...(role === "RECEPTIONIST"
          ? [{ userId: managerId, name: "Manager", role: "CenterManager" }]
          : []),
      ]);
    if (path === "/api/member-support-requests/queue") {
      followUpQueries.push(url.search);
      return json({ items: [row], totalCount: 1, page: 1, pageSize: 20 });
    }
    if (path === `/api/member-support-requests/${requestId}`) return json(row);
    if (path === `/api/member-support-requests/${requestId}/events`)
      return json(
        reported
          ? [
              {
                eventId: "event-1",
                type: "MEMBER_REPORTED_NOT_RECEIVED",
                note: null,
                createdAt: "2026-10-24T04:00:00Z",
                actorName: "Member An",
                actorRole: "Member",
                targetName: null,
              },
            ]
          : [],
      );
    if (path === `/api/member-support-requests/${requestId}/bank-details`)
      return role === "CENTER_MANAGER"
        ? json({
            bankName: "Test Bank",
            accountNumber: "12345678",
            accountHolder: "Member An",
            purgedAtUtc: null,
          })
        : route.fulfill({ status: 403, json: { error: "forbidden" } });
    if (
      path === `/api/member-support-requests/${requestId}/payout` &&
      request.method() === "POST"
    ) {
      payoutBody = request.postData() ?? "";
      paid = true;
      return json({ payoutId: "payout-1", amount: 50000 });
    }
    if (path === "/api/front-desk/payment-reconciliation") {
      followUpQueries.push(url.search);
      return json({
        items: [
          {
            invoiceId,
            invoiceNumber: "INV-PAID",
            memberId,
            memberName: "Member An",
            memberEmail: "an@example.com",
            paymentAttemptId: "attempt-1",
            amount: 50000,
            paidAtUtc: "2026-10-24T01:00:00Z",
            issuedAtUtc: "2026-10-23T01:00:00Z",
            holdExpiresAtUtc: null,
            state: "RECONCILIATION_REQUIRED",
            lastError: null,
            totalAmount: 50000,
            pointsApplied: 0,
            invoiceStatus: "PaidAfterReconciliation",
            items: [],
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
      });
    }
    if (path === "/api/reports/revenue")
      return json({
        fromDate: "2026-10-01",
        toDate: "2026-10-25",
        netRevenue: 100000,
        totalRefunded: 0,
        paymentCount: 1,
        bankRefundPaid: 50000,
        bankRefundCount: 1,
        pointsRedeemed: 0,
        pointsRefunded: 0,
        outstandingPoints: 0,
        bySource: [],
        bySportAndSource: [],
        daily: [],
      });
    if (path === "/api/reports/revenue-dimensions")
      return json({ rows: [], pointsRedeemedVnd: 0 });
    if (path === "/api/reports/membership-period")
      return json({
        newMembers: 0,
        activeMembersAtPeriodEnd: 0,
        membersPurchasingMembershipInPeriod: 0,
      });
    if (path === "/api/reports/class-enrollment") return json({ classes: [] });
    if (path === "/api/reports/court-bookings")
      return json({
        totalBookings: 0,
        totalBookedHours: 0,
        bySport: [],
        daily: [],
      });
    if (path === "/api/reports/recorded-attendance") return json({ daily: [] });
    if (path === "/api/reports/class-status")
      return json({ open: 0, completed: 0, unpublished: 0, classes: [] });
    if (path === "/api/reports/membership-summary")
      return json({ membersWithActiveMembership: 0 });
    if (path === "/api/manager/classes")
      return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path === "/api/users")
      return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path === `/api/users/${memberId}`)
      return json({
        userId: memberId,
        fullName: "Member An",
        email: "an@example.com",
        role: "MEMBER",
      });
    if (path === `/api/members/${memberId}/packages`) return json([]);
    if (path === "/api/manager/court-schedule") return json([]);
    if (path === "/api/manager/rooms") return json([]);
    if (path === "/api/invoices")
      return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path === "/api/manager/sports" || path === "/api/sports")
      return json([]);
    if (path === "/api/support/attachments/proof-1")
      return route.fulfill({ contentType: "image/png", body: png });
    return json([]);
  });
  return {
    followUpQueries,
    payoutBody: () => payoutBody,
    report: () => {
      reported = true;
    },
  };
}

test("F4 receptionist sees overdue queue and the paid, not activated follow-up without payout controls", async ({
  page,
}) => {
  const state = await fixture(page, "RECEPTIONIST");
  await page.goto("/receptionist/support?overdue=1");
  await expect(
    page.getByRole("button", { name: /Overdue/ }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Overdue since")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Payment payout" }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Department" })
    .selectOption("manager");
  await page
    .getByRole("combobox", { name: "Staff member" })
    .selectOption(managerId);
  await expect(
    page.getByRole("button", { name: "Transfer request" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Transfer note (required)" })
    .fill("Manager review needed for this payment.");
  await expect(
    page.getByRole("button", { name: "Transfer request" }),
  ).toBeEnabled();
  expect(
    state.followUpQueries.some((query) => query.includes("overdue=true")),
  ).toBe(true);
  await page.goto("/receptionist/payment-reconciliation?view=paid");
  await expect(page.getByText("INV-PAID")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify / retry fulfillment" }),
  ).toHaveCount(0);
  expect(
    state.followUpQueries.some((query) =>
      query.includes("outcome=RECONCILIATION_REQUIRED"),
    ),
  ).toBe(true);
  await page.goto("/receptionist");
  await expect(
    page.getByRole("link", { name: /Overdue support requests/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Paid, not activated/ }),
  ).toBeVisible();
});

test("F5 manager records payout proof and sees reported receipt and separate revenue", async ({
  page,
}) => {
  const state = await fixture(page, "CENTER_MANAGER");
  await page.goto(`/manager/requests?type=support&request=${requestId}`);
  const payout = page.getByRole("region", { name: "Payment payout" });
  await expect(
    payout.getByText("Receiving account could not be loaded."),
  ).toHaveCount(0);
  await expect(
    payout.getByRole("button", { name: "Record payout" }),
  ).toBeDisabled();
  await payout
    .getByRole("spinbutton", { name: "Amount transferred (VND)" })
    .fill("50000");
  await payout.getByLabel(/Transfer proof/).setInputFiles({
    name: "transfer.png",
    mimeType: "image/png",
    buffer: png,
  });
  await payout.getByRole("checkbox").check();
  await expect(
    payout.getByRole("button", { name: "Record payout" }),
  ).toBeDisabled();
  await payout
    .getByRole("textbox", { name: "Note about the call and refund (required)" })
    .fill("Called the member and completed the bank transfer.");
  await payout.getByRole("button", { name: "Record payout" }).click();
  await expect(payout.getByText(/Recorded:.*50,000/)).toBeVisible();
  expect(state.payoutBody()).toContain("50000");
  state.report();
  await page.reload();
  await expect(
    page.getByText("Member reported not received. Awaiting manager review."),
  ).toBeVisible();
  await page.goto("/manager");
  await expect(page.getByText("Overdue support requests: 0")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bank payouts recorded", exact: true }),
  ).toBeVisible();
  await page.goto("/manager/reports?tab=revenue");
  await expect(page.getByText(/Recorded bank payouts:/)).toBeVisible();
});

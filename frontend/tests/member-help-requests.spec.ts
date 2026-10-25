import { expect, test, type Page } from "@playwright/test";

const open = "11111111-1111-4111-8111-111111111111";
const payout = "22222222-2222-4222-8222-222222222222";
const invoiceId = "33333333-3333-4333-8333-333333333333";
const proof = "44444444-4444-4444-8444-444444444444";
const iso = (offsetHours: number) =>
  new Date(Date.now() + offsetHours * 3_600_000).toISOString();

const row = (over: Record<string, unknown>) => ({
  category: "FACILITY",
  description: "Locker is broken",
  status: "OPEN",
  invoiceId: null,
  createdAt: iso(-3),
  updatedAt: null,
  response: null,
  slaDueAtUtc: iso(45),
  remindCount: 0,
  payout: null,
  isOverdue: false,
  canRemindAtUtc: iso(45),
  ...over,
});

async function mock(
  page: Page,
  requests: unknown[],
  calls: string[] = [],
  extra: (path: string) => unknown = () => undefined,
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") calls.push(`${request.method()} ${path}`);
    const custom = extra(path);
    let json: unknown = [];
    if (custom !== undefined) json = custom;
    else if (path === "/api/users/me")
      json = {
        userId: "member-1",
        email: "member@example.com",
        fullName: "Alex Member",
        role: "MEMBER",
      };
    else if (path === "/api/support/requests/mine") json = requests;
    else if (path === "/api/members/me/invoices")
      json = { items: [], totalCount: 0, page: 1, pageSize: 100 };
    if (path.startsWith("/api/support/attachments/"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    return route.fulfill({ json });
  });
}

test("Help: My requests badge, distinct stage colors and SLA with Remind us", async ({
  page,
}) => {
  const calls: string[] = [];
  await mock(
    page,
    [
      row({ requestId: open }),
      row({
        requestId: "a1",
        status: "ASSIGNED",
        category: "CLASS",
        description: "Coach late",
      }),
      row({
        requestId: "a2",
        status: "REJECTED",
        category: "OTHER",
        description: "Declined thing",
      }),
      row({
        requestId: "a3",
        status: "IN_PROGRESS",
        description: "Working",
        isOverdue: true,
        slaDueAtUtc: iso(-2),
        canRemindAtUtc: iso(-2),
      }),
    ],
    calls,
  );
  await page.goto("/member/help?tab=requests");
  const list = page.getByRole("region", { name: "My requests" });
  const colors = new Set<string>();
  for (const label of ["Received", "Assigned", "Declined", "In progress"]) {
    const pill = list.getByText(label, { exact: true }).first();
    await expect(pill).toBeVisible();
    colors.add(
      await pill.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
  }
  expect(colors.size).toBe(4);

  await list.getByRole("button", { name: /Working/ }).click();
  const detail = page.getByRole("article", { name: "Request details" });
  await expect(detail).toContainText("This is taking longer than usual");
  await detail.getByRole("button", { name: "Remind us" }).click();
  await expect(detail).toContainText("Reminder sent");
  expect(calls).toContain("POST /api/support/requests/a3/remind");

  await list.getByRole("button", { name: /Locker is broken/ }).click();
  await expect(detail).toContainText("We aim to reply by");
  await expect(detail.getByRole("button", { name: "Remind us" })).toBeDisabled();
});

test("Help: member confirms a transfer and the tab shows a badge", async ({
  page,
}) => {
  const calls: string[] = [];
  await mock(
    page,
    [
      row({
        requestId: payout,
        category: "PAYMENT",
        status: "CLOSED",
        invoiceId,
        payout: {
          amount: 50000,
          recordedAtUtc: iso(-5),
          memberConfirmedAtUtc: null,
          memberConfirmedBy: null,
          proofAttachmentIds: [proof],
        },
      }),
    ],
    calls,
  );
  await page.goto("/member/help?tab=requests");
  await expect(
    page.getByRole("tab", { name: /My requests/ }).getByLabel(/need your confirmation/),
  ).toHaveText("1");
  await expect(page.getByText("Action needed")).toBeVisible();
  await page.getByRole("button", { name: /Payment/ }).click();
  const detail = page.getByRole("article", { name: "Request details" });
  await expect(detail).toContainText("We sent");
  await expect(detail.getByRole("button", { name: /View Transfer proof 1/ })).toBeVisible();
  await detail.getByRole("button", { name: "I received it" }).click();
  expect(calls).toContain(`POST /api/support/requests/${payout}/confirm-received`);

  await detail.getByRole("button", { name: "Not received" }).click();
  await page.getByRole("button", { name: "Yes, not received" }).click();
  expect(calls).toContain(
    `POST /api/support/requests/${payout}/report-not-received`,
  );
});

test("Help: PAYMENT needs an invoice and a proof image, with no bank fields", async ({
  page,
}) => {
  await mock(page, [], [], (path) =>
    path === "/api/members/me/invoices"
      ? {
          items: [
            {
              invoiceId,
              invoiceNumber: "INV-1",
              cashAmount: 50000,
              issuedAt: iso(-24),
              paidAtUtc: iso(-24),
              status: "PAID",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 100,
        }
      : undefined,
  );
  await page.goto("/member/help?topic=PAYMENT");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await page.getByLabel(/What happened/).fill("Charged twice");
  await page.getByLabel(/I agree/).check();
  await expect(send).toBeDisabled();
  await page.getByLabel(/Paid invoice/).selectOption(invoiceId);
  await expect(page.getByLabel(/Bank name|Account number|Account holder/)).toHaveCount(0);
  await expect(page.getByText(/manager will call you/)).toBeVisible();
  await expect(send).toBeDisabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
  });
  await expect(send).toBeEnabled();
});

test("Invoice: paid but not activated offers points or a support request", async ({
  page,
}) => {
  const calls: string[] = [];
  const detail = {
    summary: {
      invoiceId,
      invoiceNumber: "INV-9",
      status: "PAID_AFTER_RECONCILIATION",
      fulfillmentOutcome: "RECONCILIATION_REQUIRED",
      reconciliationRequired: true,
      totalAmount: 50000,
      cashAmount: 50000,
      pointsSpent: 0,
      outstanding: 0,
      issuedAt: iso(-2),
    },
    items: [],
    payments: [],
    adjustments: [],
  };
  await mock(page, [], calls, (path) => {
    if (path === `/api/invoices/${invoiceId}`) return detail;
    if (path === "/api/members/me/unactivated-payments")
      return [{ invoiceId, invoiceNumber: "INV-9", cashAmount: 50000 }];
    if (path === `/api/invoices/${invoiceId}/convert-to-points`)
      return { invoiceId, points: 50 };
    return undefined;
  });
  await page.goto(`/member/finance?tab=invoices&invoice=${invoiceId}`);
  await expect(
    page.getByText("Paid, but your service was not activated"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Send a support request" }),
  ).toHaveAttribute("href", /topic=PAYMENT&invoiceId=/);
  await page.getByRole("button", { name: "Receive points now" }).click();
  await page.getByRole("button", { name: "Yes, receive points" }).click();
  await expect(page.getByText("50 points were added")).toBeVisible();
  expect(calls).toContain(`POST /api/invoices/${invoiceId}/convert-to-points`);
});

test("Overview lists paid-not-activated and receipt confirmations", async ({
  page,
}) => {
  await mock(
    page,
    [
      row({
        requestId: payout,
        category: "PAYMENT",
        status: "CLOSED",
        invoiceId,
        payout: {
          amount: 50000,
          recordedAtUtc: iso(-5),
          memberConfirmedAtUtc: null,
          memberConfirmedBy: null,
          proofAttachmentIds: [],
        },
      }),
    ],
    [],
    (path) =>
      path === "/api/members/me/unactivated-payments"
        ? [{ invoiceId, invoiceNumber: "INV-9", cashAmount: 50000 }]
        : undefined,
  );
  await page.goto("/member");
  await expect(page.getByText(/service not activated/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Confirm receipt/ }),
  ).toHaveAttribute("href", /\/member\/help\?tab=requests&requestId=/);
});

import { expect, test, type Page } from "@playwright/test";

// AN-01: checkout summary, Tài chính tabs, chi tiết hóa đơn và alias route cũ. API được mock.
const id = "22222222-2222-2222-2222-222222222222";

async function setup(
  page: Page,
  checkoutOverrides: Record<string, unknown> = {},
  summaryOverrides: Record<string, unknown> = {},
) {
  const checkout = {
    invoiceId: id,
    kind: "CLASS",
    state: "ACTIVE",
    invoiceStatus: "ISSUED",
    totalAmount: 300000,
    pointsApplied: 200,
    cashAmount: 100000,
    expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
    serverNowUtc: new Date().toISOString(),
    revision: 3,
    fulfillmentOutcome: "PENDING",
    reconciliationRequired: false,
    ...checkoutOverrides,
  };
  const summary = {
    invoiceId: id,
    invoiceNumber: "INV-0001",
    memberName: "Current Member",
    memberEmail: "member@example.com",
    totalAmount: 300000,
    pointsSpent: 200,
    cashAmount: 100000,
    outstanding: 100000,
    status: "ISSUED",
    fulfillmentOutcome: "PENDING",
    reconciliationRequired: false,
    issuedAt: new Date().toISOString(),
    checkoutExpiresAtUtc: checkout.expiresAtUtc,
    ...summaryOverrides,
  };
  const detail = {
    summary,
    items: [
      {
        itemId: "item-1",
        description: "Badminton course",
        quantity: 1,
        unitPrice: 300000,
        lineAmount: 300000,
      },
    ],
    payments: [],
    adjustments: [],
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === "/api/checkouts/wallet-top-up" &&
      route.request().method() === "POST"
    )
      return route.fulfill({
        json: {
          ...checkout,
          kind: "WALLET_TOP_UP",
          pointsApplied: 0,
          totalAmount: 20000,
          cashAmount: 20000,
          beneficiaryUserId: "member-1",
          initiatorUserId: "member-1",
        },
      });
    if (
      path === `/api/checkouts/${id}/attempts` &&
      route.request().method() === "POST"
    )
      return route.fulfill({
        json: {
          paymentAttemptId: "attempt-1",
          invoiceId: id,
          transactionReference: "attempt-1",
          cashAmount: 20000,
          pointsApplied: 0,
          expiresAtUtc: checkout.expiresAtUtc,
          paymentUrl: "https://sandbox.vnpayment.vn/test-top-up",
          state: "PENDING",
        },
      });
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "member-1",
          email: "member@example.com",
          fullName: "Current Member",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path === "/api/wallet/me")
      return route.fulfill({
        json: { availablePoints: 0, heldPoints: 200, vndPerPoint: 1000 },
      });
    if (path === `/api/invoices/${id}`) return route.fulfill({ json: detail });
    if (path === `/api/checkouts/${id}`)
      return route.fulfill({ json: checkout });
    if (path === "/api/members/me/invoices")
      return route.fulfill({
        json: { items: [summary], page: 1, pageSize: 10, totalCount: 1 },
      });
    if (path === "/api/refunds/mine")
      return route.fulfill({
        json: {
          items: [
            {
              adjustmentId: "refund-1",
              invoiceId: id,
              invoiceNumber: "INV-0001",
              reason: "Membership cancellation",
              status: "REQUESTED",
              systemCalculatedPoints: 150,
              approvedPoints: null,
              createdAt: new Date().toISOString(),
            },
          ],
          page: 1,
          pageSize: 10,
          totalCount: 1,
        },
      });
    return route.fulfill({ json: [] });
  });
}

test("member can start a VNPay points top-up from an empty wallet", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://sandbox.vnpayment.vn/**", (route) =>
    route.fulfill({ body: "VNPay test gateway" }),
  );
  await page.goto("/member/finance?tab=wallet");
  await expect(page.getByText("Points never expire")).toHaveCount(0);
  await page.getByRole("link", { name: "Add points" }).click();
  await expect(page).toHaveURL(/\/member\/wallet\/top-up/);
  const amount = page.getByRole("textbox", { name: "Amount in VND" });
  const next = page.getByRole("button", { name: "Continue to payment" });
  await amount.fill("5000");
  await expect(next).toBeDisabled();
  await amount.fill("20500");
  await expect(next).toBeDisabled();
  await amount.fill("20000");
  await expect(page.getByText("You receive")).toBeVisible();
  const create = page.waitForRequest((request) =>
    request.url().endsWith("/api/checkouts/wallet-top-up"),
  );
  await next.click();
  expect((await create).postDataJSON()).toEqual({ points: 20 });
  await expect(page.getByText("Top up 20 points")).toBeVisible();
  await expect(page.getByText("9704198526191432198")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change amount" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pay with VNPay" }).click();
  await expect(page).toHaveURL("https://sandbox.vnpayment.vn/test-top-up");
});

test("checkout summary shows server split and one countdown", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/checkout/${id}`);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary).toContainText("300,000");
  await expect(summary).toContainText("200 points");
  await expect(summary).toContainText("100,000");
  await expect(summary.locator("time")).toHaveText(/^(9|10):\d\d$/);
  await expect(page.getByText("Badminton course")).toHaveCount(1);
  await expect(page.getByRole("spinbutton")).toBeVisible();
});

test("overview Pay now resumes the active checkout and its existing countdown", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/member");
  const payNow = page.getByRole("link", { name: /Pay now.*INV-0001/i });
  await expect(payNow).toHaveAttribute("href", `/checkout/${id}`);
  await payNow.click();
  await expect(page).toHaveURL(`/checkout/${id}`);
  await expect(
    page.getByRole("complementary", { name: "Order summary" }).locator("time"),
  ).toHaveText(/^(9|10):\d\d$/);
});

test("invoice list Pay now resumes the active checkout", async ({ page }) => {
  await setup(page);
  await page.goto("/member/finance?tab=invoices");
  const payNow = page.getByRole("link", { name: "Pay now" });
  await expect(payNow).toHaveAttribute("href", `/checkout/${id}`);
  await payNow.click();
  await expect(page).toHaveURL(`/checkout/${id}`);
});

test("zero balance does not break points selection", async ({ page }) => {
  await setup(page, { pointsApplied: 0, cashAmount: 300000 });
  await page.goto(`/checkout/${id}`);
  await expect(
    page.getByText("No points available", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("spinbutton")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pay with VNPay", exact: true }),
  ).toBeEnabled();
});

test("expired hold stops payment actions", async ({ page }) => {
  await setup(page, {
    expiresAtUtc: new Date(Date.now() - 1000).toISOString(),
  });
  await page.goto(`/checkout/${id}`);
  await expect(
    page.getByRole("button", { name: "Pay with VNPay", exact: true }),
  ).toHaveCount(0);
});

test("finance tabs, invoice detail and legacy aliases", async ({ page }) => {
  await setup(page);
  await page.goto("/member/wallet");
  await expect(page).toHaveURL(/\/member\/finance\?tab=wallet/);
  await expect(page.locator("#main-content h1")).toHaveText("Billing");
  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page).toHaveURL(/tab=invoices/);
  await expect(page.getByText("INV-0001")).toBeVisible();
  await page.getByRole("link", { name: "INV-0001" }).click();
  await expect(page).toHaveURL(`/member/finance?tab=invoices&invoice=${id}`);
  await expect(
    page.getByRole("cell", { name: "Badminton course" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue payment" }),
  ).toHaveAttribute("href", `/checkout/${id}`);
  await page.goto(`/member/invoices?invoiceId=${id}`);
  await expect(page).toHaveURL(`/member/finance?tab=invoices&invoice=${id}`);
});

test("member can review their point refund and open its invoice", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/member/finance?tab=refunds");
  await expect(
    page.getByRole("tab", { name: "Point refunds" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Membership cancellation")).toBeVisible();
  await expect(page.getByText("150", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View invoice" }).click();
  await expect(page).toHaveURL(`/member/finance?tab=invoices&invoice=${id}`);
});

test("reloaded day-pass checkout explains validity and no refunds before payment", async ({
  page,
}) => {
  await setup(page, {
    kind: "MEMBERSHIP",
    isDayPass: true,
    closingSoon: true,
    closesAtUtc: "2026-10-25T15:00:00Z",
  });
  await page.goto(`/checkout/${id}`);
  await expect(page.getByRole("note")).toContainText("The gym closes at 22:00");
  await expect(page.getByRole("note")).toContainText("not refundable");
});

test("member downloads the invoice PDF through the authenticated endpoint", async ({
  page,
}) => {
  await setup(page, {}, {
    status: "PAID",
    outstanding: 0,
    fulfillmentOutcome: "FULFILLED",
  });
  await page.route(`**/api/invoices/${id}/receipt.pdf`, (route) => {
    expect(route.request().headers()["authorization"]).toBe(
      "Bearer test-token",
    );
    return route.fulfill({
      contentType: "application/pdf",
      headers: {
        "content-disposition": 'attachment; filename="INV-0001.pdf"',
      },
      body: "%PDF-1.4\n%%EOF",
    });
  });
  await page.goto(`/member/finance?tab=invoices&invoice=${id}`);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download invoice" }).click();
  expect((await downloaded).suggestedFilename()).toBe(
    `SportHub-invoice-${id}.pdf`,
  );
});

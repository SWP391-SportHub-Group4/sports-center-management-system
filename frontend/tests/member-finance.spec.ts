import { expect, test, type Page } from "@playwright/test";

// AN-01: checkout summary, Tài chính tabs, chi tiết hóa đơn và alias route cũ. API được mock.
const id = "22222222-2222-2222-2222-222222222222";

async function setup(
  page: Page,
  checkoutOverrides: Record<string, unknown> = {},
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
    return route.fulfill({ json: [] });
  });
}

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

test("zero balance does not break points selection", async ({ page }) => {
  await setup(page, { pointsApplied: 0, cashAmount: 300000 });
  await page.goto(`/checkout/${id}`);
  await expect(
    page.getByText("No points available", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("spinbutton")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeEnabled();
});

test("expired hold stops payment actions", async ({ page }) => {
  await setup(page, {
    expiresAtUtc: new Date(Date.now() - 1000).toISOString(),
  });
  await page.goto(`/checkout/${id}`);
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
});

test("finance tabs, invoice detail and legacy aliases", async ({ page }) => {
  await setup(page);
  await page.goto("/member/wallet");
  await expect(page).toHaveURL(/\/member\/finance\?tab=wallet/);
  await expect(page.locator("#main-content h1")).toHaveText("Finance");
  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page).toHaveURL(/tab=invoices/);
  await expect(page.getByText("INV-0001")).toBeVisible();
  await page.getByRole("link", { name: "Details" }).click();
  await expect(page).toHaveURL(`/member/invoices/${id}`);
  await expect(
    page.getByRole("cell", { name: "Badminton course" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue payment" }),
  ).toHaveAttribute("href", `/checkout/${id}`);
  await page.goto(`/member/invoices?invoiceId=${id}`);
  await expect(page).toHaveURL(`/member/invoices/${id}`);
});

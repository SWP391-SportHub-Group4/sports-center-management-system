import { expect, test, type Page } from "@playwright/test";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const otherInvoiceId = "22222222-2222-4222-8222-222222222222";
const noticeId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";
const actionUrl = `/manager/finance?invoiceId=${invoiceId}`;

async function fixture(page: Page, resolved = false, missing = false) {
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-payment-notice");
    localStorage.setItem("sporthub_lang", "en");
  });
  const notice = {
    notificationId: noticeId, sourceEventType: "PAYMENT_UNACTIVATED",
    sourceEntityId: "55555555-5555-4555-8555-555555555555",
    sentAt: "2026-10-25T01:00:00Z", status: "READ", actionUrl,
    message: "Invoice INV-NEEDS-REVIEW was paid but the service was not activated. Review the payment and invoice details.",
  };
  const summary = {
    invoiceId, invoiceNumber: "INV-NEEDS-REVIEW", memberId,
    memberName: "Alex Member", memberEmail: "alex@example.test",
    totalAmount: 100000, pointsSpent: 0, cashAmount: 100000,
    fulfillmentOutcome: resolved ? "COMPENSATED" : "RECONCILIATION_REQUIRED",
    reconciliationRequired: !resolved, grossCollected: 100000,
    obligationReduction: 0, refundedAmount: 0, netCollected: 100000,
    netPayable: 100000, outstanding: 0, refundDue: 0,
    status: "PAID_AFTER_RECONCILIATION", issuedAt: "2026-10-25T01:00:00Z",
  };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    const json = (value: unknown) => route.fulfill({ json: value });
    if (path === "/api/users/me") return json({
      userId: "66666666-6666-4666-8666-666666666666", fullName: "Center Manager",
      email: "manager@example.test", role: "CENTER_MANAGER", sportIds: [],
    });
    if (path === "/api/notifications/unread-count") return json({ count: 0 });
    if (path === "/api/notifications") return json([notice]);
    if (path === "/api/notifications/inbox") return json({ items: [notice], totalCount: 1, page: 1, pageSize: 25 });
    if (path === `/api/notifications/${noticeId}`) return json(notice);
    if (path.endsWith("/read")) return route.fulfill({ status: 204 });
    if (path === "/api/invoices") return json({ items: [{ ...summary, invoiceId: otherInvoiceId, invoiceNumber: "INV-OTHER" }], totalCount: 1, page: 1, pageSize: 10 });
    if (path === `/api/invoices/${invoiceId}` || path === `/api/invoices/${otherInvoiceId}`) {
      if (missing && path.endsWith(invoiceId)) return route.fulfill({ status: 404, json: { message: "Invoice not found.", error: "invoice_not_found" } });
      return json({
        summary: path.endsWith(otherInvoiceId) ? { ...summary, invoiceId: otherInvoiceId, invoiceNumber: "INV-OTHER" } : summary,
        memberPackageId: null, suggestedRefundAmount: 0, adjustments: [],
        items: [{ itemId: "item", itemType: "Membership", description: "Monthly gym membership", unitPrice: 100000, quantity: 1, lineAmount: 100000 }],
        payments: [{ paymentId: "payment", amount: 100000, method: "VNPay", status: "SUCCESS", referenceCode: "VNP-123456", paidAt: "2026-10-25T01:01:00Z" }],
      });
    }
    return json([]);
  });
  return writes;
}

for (const width of [1440, 390]) {
  test(`manager opens the linked invoice from payment notification at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const writes = await fixture(page);
    await page.goto(`/notifications?message=${noticeId}`);
    const reader = page.getByRole("region", { name: "Message reader", exact: true });
    await expect(reader.getByRole("heading", { name: "Payment received, service not activated" })).toBeVisible();
    const cta = reader.getByRole("link", { name: "Review payment" });
    await expect(cta).toHaveAttribute("href", actionUrl);
    await cta.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../.tmp/manager-payment-notification/inbox-${width}.png` });
    await cta.click();
    await expect(page).toHaveURL(actionUrl);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("INV-NEEDS-REVIEW");
    await expect(dialog).not.toContainText("INV-OTHER");
    await expect(dialog.getByRole("note")).toContainText("Payment received, service not activated");
    await dialog.getByRole("note").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../.tmp/manager-payment-notification/invoice-${width}.png` });
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await dialog.getByRole("button", { name: /close/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL("/manager/finance");
    expect(writes.filter(path => !path.startsWith("/api/notifications/"))).toEqual([]);
  });
}

test("old notification opens current invoice status; missing invoice is recoverable", async ({ page }) => {
  await fixture(page, true);
  await page.goto(actionUrl);
  await expect(page.getByRole("dialog")).toContainText("INV-NEEDS-REVIEW");
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("missing linked invoice shows error and can be closed", async ({ page }) => {
  await fixture(page, false, true);
  await page.goto(actionUrl);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Invoice not found");
  await page.getByRole("dialog").getByRole("button", { name: /close/i }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

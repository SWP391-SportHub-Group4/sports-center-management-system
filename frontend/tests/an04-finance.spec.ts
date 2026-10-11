import { expect, test, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const invoiceId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const adjustmentId = "55555555-5555-4555-8555-555555555555";
const paged = (items: unknown[]) => ({
  items,
  page: 1,
  pageSize: 20,
  totalCount: items.length,
});

const refund = {
  adjustmentId,
  invoiceId,
  invoiceItemId: itemId,
  invoiceNumber: "INV-0042",
  status: "REQUESTED",
  requestedByUserId: memberId,
  requestedByName: "Alice",
  createdAt: "2030-10-03T02:00:00Z",
  reason: "Cannot attend the course",
  systemCalculatedPoints: 300,
  approvedPoints: null,
  pointLedgerEntryId: null,
};

async function managerFixture(page: Page, exportsRows: unknown[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const calls: { path: string; body: unknown }[] = [];
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
      calls.push({ path, body: request.postDataJSON() });
      return json({ ...refund, status: "COMPLETED" });
    }
    if (path === "/api/refunds") return json(paged([refund]));
    if (path === "/api/invoices") return json(paged([]));
    if (path === "/api/reports/exports") return json(paged(exportsRows));
    if (path === "/api/reports/revenue")
      return json({
        fromDate: "2030-10-01",
        toDate: "2030-10-31",
        totalCollected: 100000,
        pointsRedeemedVnd: 200000,
        pointsIssued: 50,
        outstandingPoints: 70,
        managerPointAdjustment: 0,
        legacyCashCollected: 0,
        reconciliationCashCollected: 0,
      });
    if (path === "/api/reports/revenue-dimensions")
      return json({
        fromDate: "2030-10-01",
        toDate: "2030-10-31",
        cashCollected: 100000,
        pointsRedeemedVnd: 200000,
        rows: [],
      });
    if (path === "/api/reports/membership-period")
      return json({ newMembers: 2, activeMembersAtPeriodEnd: 7 });
    if (path === "/api/reports/class-enrollment")
      return json({ classes: [], totalClasses: 0 });
    if (path === "/api/manager/sports") return json([]);
    return json([]);
  });
  return calls;
}

test("finance has invoices and refunds as tabs, and the old refund address redirects", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/payment-adjustments");
  await expect(page).toHaveURL(/\/manager\/finance\?tab=refunds$/);
  await expect(page.getByRole("tab", { name: "Refunds" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page).toHaveURL(/\/manager\/finance$/);
});

test("refund queue shows a readable request, never raw ids, and needs a reason to decide", async ({
  page,
}) => {
  const calls = await managerFixture(page);
  await page.goto("/manager/finance?tab=refunds");
  await expect(page.getByText("INV-0042")).toBeVisible();
  await expect(page.getByText("Requested by Alice")).toBeVisible();
  await expect(page.getByText(/300 .*300,000/)).toBeVisible();
  await expect(page.getByText(itemId)).toHaveCount(0);
  await expect(
    page.getByText(/Cash and card refunds are not available/),
  ).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeDisabled();
  await page.getByLabel("Review reason").fill("Policy confirmed");
  await approve.click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].path).toBe(`/api/refunds/${adjustmentId}/approve`);
  expect(calls[0].body).toEqual({
    reason: "Policy confirmed",
    centerFault: false,
  });
});

test("reports use one period filter with tabs, and exports live on their own page", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/reports");
  await expect(page.getByText("Cash collected (VND)").first()).toBeVisible();
  await page.getByRole("tab", { name: "Members" }).click();
  await expect(page).toHaveURL(/tab=members/);
  await expect(page.getByText("New members")).toBeVisible();
  await page.getByRole("link", { name: "Exports and downloads" }).click();
  await expect(page).toHaveURL(/\/manager\/reports\/exports$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Report exports",
  );
  await expect(page.getByText("No exports yet.")).toBeVisible();
});

test("export history shows progress for a queued file and download for a finished one", async ({
  page,
}) => {
  await managerFixture(page, [
    {
      reportExportId: "e1",
      reportType: "REVENUE_DIMENSIONS",
      status: "QUEUED",
      format: "Csv",
      rowCount: 0,
      createdAt: "2030-10-03T02:00:00Z",
      expiresAt: "2030-10-10T02:00:00Z",
      failureReason: null,
    },
    {
      reportExportId: "e2",
      reportType: "CLASS_ENROLLMENT",
      status: "COMPLETED",
      format: "Pdf",
      rowCount: 12,
      createdAt: "2030-10-03T01:00:00Z",
      expiresAt: "2030-10-10T01:00:00Z",
      failureReason: null,
    },
  ]);
  await page.goto("/manager/reports/exports");
  await expect(page.getByText("Preparing the file…")).toHaveCount(1);
  await expect(page.getByText("12 rows")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(1);
});

test("a member asks for a refund only after opening the form and is told nothing is returned yet", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const posts: unknown[] = [];
  const summary = {
    invoiceId,
    invoiceNumber: "INV-0042",
    memberName: "Alice",
    memberEmail: "a@example.com",
    totalAmount: 300000,
    pointsSpent: 0,
    cashAmount: 300000,
    outstanding: 0,
    status: "PAID",
    fulfillmentOutcome: "FULFILLED",
    reconciliationRequired: false,
    issuedAt: "2030-10-01T00:00:00Z",
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: memberId,
        email: "a@example.com",
        fullName: "Alice",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === `/api/invoices/${invoiceId}`)
      return json({
        summary,
        items: [
          {
            itemId,
            description: "Badminton course",
            quantity: 1,
            unitPrice: 300000,
            lineAmount: 300000,
          },
        ],
        payments: [],
        adjustments: [],
      });
    if (path === `/api/refunds/quote/${itemId}`)
      return json({ systemCalculatedPoints: 300 });
    if (path === "/api/refunds" && request.method() === "POST") {
      posts.push(request.postDataJSON());
      return json({ ok: true });
    }
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
  await page.goto(`/member/invoices/${invoiceId}`);
  await expect(
    page.getByRole("combobox", { name: "Request refund to wallet" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Request a refund" }).click();
  await page
    .getByRole("combobox", { name: "Request refund to wallet" })
    .selectOption(itemId);
  await expect(page.getByText(/Estimated refund: 300 points/)).toBeVisible();
  await page.getByLabel("Reason", { exact: true }).fill("Cannot attend");
  await page
    .getByRole("button", { name: "Request refund to wallet", exact: true })
    .click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ invoiceItemId: itemId, reason: "Cannot attend" });
  await expect(
    page.getByText(/No points are returned until the center approves it/),
  ).toBeVisible();
});

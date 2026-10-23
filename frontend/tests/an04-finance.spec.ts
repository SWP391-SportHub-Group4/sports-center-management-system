import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/locales/en";

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
    if (path.endsWith("/approval-quote")) {
      const centerFault =
        new URL(request.url()).searchParams.get("centerFault") === "true";
      return json({
        systemCalculatedPoints: centerFault ? 600 : 300,
        remainingPaidVnd: 600000,
        maxPercent: centerFault ? 100 : 50,
        centerFault,
      });
    }
    if (path === "/api/invoices") return json(paged([]));
    if (path === "/api/reports/exports") return json(paged(exportsRows));
    if (path === "/api/reports/revenue")
      return json({
        fromDate: "2030-10-01",
        toDate: "2030-10-31",
        totalCollected: 100000,
        pointsRedeemed: 200,
        pointsRedeemedVnd: 200000,
        pointsRefunded: 0,
        pointsIssued: 50,
        outstandingPoints: 70,
        outstandingPointsAsOfUtc: "2030-11-12T03:00:00Z",
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

test("refund addresses redirect to the shared Request workspace", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/payment-adjustments");
  await expect(page).toHaveURL(/\/manager\/requests\?type=refunds$/);
  await expect(page.getByRole("tab", { name: "Refunds" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto("/manager/finance");
  await expect(page).toHaveURL(/\/manager\/finance$/);
});

test("refund queue shows a readable request, never raw ids, and needs a reason to decide", async ({
  page,
}) => {
  const calls = await managerFixture(page);
  await page.goto("/manager/finance?tab=refunds");
  await expect(page.getByText("INV-0042")).toBeVisible();
  await expect(page.getByText("Requested by Alice")).toBeVisible();
  await expect(page.getByText(/300 .*300,000/).first()).toBeVisible();
  await expect(page.getByText(itemId)).toHaveCount(0);
  await expect(
    page.getByText(/refunded to the member.s wallet as points/),
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

test("refund approval blocks excess and fractional percent and refreshes the center-fault cap", async ({
  page,
}) => {
  const calls = await managerFixture(page);
  await page.goto("/manager/finance?tab=refunds");
  const percent = page.getByRole("spinbutton", {
    name: "Lower refund percent (optional)",
  });
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await page.getByLabel("Review reason").fill("Policy confirmed");
  await expect(percent).toHaveAttribute("max", "50");
  for (const invalid of ["51", "100", "25.5", "-1", "0"]) {
    await percent.fill(invalid);
    await expect(approve).toBeDisabled();
  }
  expect(calls).toHaveLength(0);
  await percent.fill("50");
  await expect(approve).toBeEnabled();
  await percent.fill("25");
  await expect(
    page.getByText(/Calculated by the system: 150 points/),
  ).toBeVisible();
  await expect(approve).toBeEnabled();
  await page.getByLabel("Review reason").fill("Short");
  await expect(approve).toBeDisabled();
  await page.getByLabel("Review reason").fill("Policy confirmed");
  await page.getByRole("checkbox", { name: /center fault/i }).check();
  await expect(percent).toHaveValue("");
  await expect(percent).toHaveAttribute("max", "100");
  await page.getByRole("checkbox", { name: /center fault/i }).uncheck();
  await expect(percent).toHaveAttribute("max", "50");
  await percent.fill("25");
  await approve.click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].body).toEqual({
    reason: "Policy confirmed",
    centerFault: false,
    percent: 25,
  });
});

test("reports use one period filter with tabs, and exports live on their own page", async ({
  page,
}) => {
  await managerFixture(page);
  await page.goto("/manager/reports");
  await expect(page.getByText("Cash collected (VND)").first()).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Filtered collections", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(en.staffWork.redeemedPoints, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(en.staffWork.currentPointHint)).toBeVisible();
  await expect(
    page.getByText("Balance observed at", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Members" }).click();
  await expect(page).toHaveURL(/tab=members/);
  await expect(
    page.getByText("New member accounts", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Members with valid Membership on", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Exports and downloads" }).click();
  await expect(page).toHaveURL(/\/manager\/reports\/exports$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Report exports",
  );
  await expect(page.getByText("No exports yet.")).toBeVisible();
  await page
    .getByLabel("Report type", { exact: true })
    .selectOption("REVENUE_SUMMARY");
  await expect(
    page.getByRole("option", {
      name: "Revenue and points summary",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", {
      name: "Points used by members in period",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Current point balance observed at (UTC)", { exact: true }),
  ).toHaveCount(0);
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

test("Manager exports identify members by name for revenue and rental reports", async ({
  page,
}) => {
  const calls = await managerFixture(page);
  await page.goto("/manager/reports/exports");
  for (const type of ["REVENUE_DIMENSIONS", "COURT_RENTAL_REVENUE"]) {
    await page
      .getByLabel(en.staffWork.exportType, { exact: true })
      .selectOption(type);
    const columns = page.getByRole("group", {
      name: en.staffWork.columns,
      exact: true,
    });
    await expect(
      columns.getByRole("checkbox", {
        name: en.staffWork.memberId,
        exact: true,
      }),
    ).toHaveCount(0);
    await columns
      .getByRole("checkbox", { name: en.staffWork.member, exact: true })
      .check();
    await page
      .getByRole("button", { name: en.staffWork.export, exact: true })
      .click();
    await expect
      .poll(
        () =>
          calls.filter((call) => call.path === "/api/reports/exports").length,
      )
      .toBe(type === "REVENUE_DIMENSIONS" ? 1 : 2);
    const body = calls.at(-1)!.body as {
      reportType: string;
      columns: string[];
    };
    expect(body.reportType).toBe(type);
    expect(body.columns).toEqual(["memberName"]);
  }
});

for (const scenario of ["eligible", "dayPass", "overused"] as const) {
  const dayPass = scenario === "dayPass";
  const overused = scenario === "overused";
  test(
    dayPass
      ? "a day pass shows its non-refundable reason and cannot submit a refund"
      : overused
        ? "an overused membership explains the time threshold and cannot submit a standard refund"
        : "a member asks for a refund only after opening the form and is told nothing is returned yet",
    async ({ page }) => {
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
                itemType: dayPass || overused ? "MEMBERSHIP" : "CLASS_PACKAGE",
                description: dayPass
                  ? "Gym day pass"
                  : overused
                    ? "Gym membership"
                    : "Badminton course",
                quantity: 1,
                unitPrice: 300000,
                lineAmount: 300000,
              },
            ],
            payments: [],
            adjustments: [],
          });
        if (path === `/api/refunds/quote/${itemId}`)
          return dayPass
            ? route.fulfill({
                status: 409,
                json: {
                  error: "day_pass_non_refundable",
                  message: "Gym day passes cannot be refunded as points.",
                },
              })
            : json({ systemCalculatedPoints: overused ? 0 : 300 });
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
      if (dayPass) {
        await expect(
          page.getByRole("alert").filter({ hasText: "Gym day passes" }),
        ).toHaveText("Gym day passes cannot be refunded as points.");
        await page
          .getByLabel("Reason", { exact: true })
          .fill("Request day pass refund");
        await expect(
          page.getByRole("button", {
            name: "Request refund to wallet",
            exact: true,
          }),
        ).toBeDisabled();
        expect(posts).toHaveLength(0);
        return;
      }
      if (overused) {
        await expect(
          page.getByText(en.finOps.membershipRefundPolicy),
        ).toBeVisible();
        await expect(page.getByText(en.finOps.refundNothing)).toBeVisible();
        await page
          .getByLabel("Reason", { exact: true })
          .fill("I never visited the gym");
        await expect(
          page.getByRole("button", {
            name: "Request refund to wallet",
            exact: true,
          }),
        ).toBeDisabled();
        expect(posts).toHaveLength(0);
        return;
      }
      await expect(
        page.getByText(/Estimated refund: 300 points/),
      ).toBeVisible();
      await page.getByLabel("Reason", { exact: true }).fill("Cannot attend");
      await page
        .getByRole("button", { name: "Request refund to wallet", exact: true })
        .click();
      await expect.poll(() => posts.length).toBe(1);
      expect(posts[0]).toEqual({
        invoiceItemId: itemId,
        reason: "Cannot attend",
      });
      await expect(
        page.getByText(/No points are returned until the center approves it/),
      ).toBeVisible();
    },
  );
}

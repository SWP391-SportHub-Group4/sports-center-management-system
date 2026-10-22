import { expect, test, type Page } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

test("Sports service filter combines with status/search and survives reload and reset", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  await page.route("**/api/manager/sports**", (route) =>
    route.fulfill({
      json: [
        {
          sportId: 1,
          name: "Gym",
          code: "gym",
          sortOrder: 1,
          isActive: true,
          services: [{ serviceType: "MEMBERSHIP_ACCESS", isEnabled: true }],
          readiness: [],
        },
        {
          sportId: 2,
          name: "Badminton",
          code: "badminton",
          sortOrder: 2,
          isActive: true,
          services: [
            { serviceType: "COURT_RENTAL", isEnabled: true },
            {
              serviceType: "GROUP_COURSE",
              isEnabled: true,
              defaultSessionMinutes: 90,
              defaultMaxCapacity: 12,
            },
          ],
          readiness: [],
        },
        {
          sportId: 3,
          name: "Basketball",
          code: "basketball",
          sortOrder: 3,
          isActive: false,
          services: [
            { serviceType: "COURT_RENTAL", isEnabled: false },
            {
              serviceType: "GROUP_COURSE",
              isEnabled: true,
              defaultSessionMinutes: 90,
              defaultMaxCapacity: 12,
            },
          ],
          readiness: [],
        },
      ],
    }),
  );
  await page.goto("/manager/sports?page=2");
  await page.locator('summary[aria-label="Filter"]:visible').click();
  await page
    .getByLabel("Services", { exact: true })
    .selectOption("COURT_RENTAL");
  await expect(page).toHaveURL(/service=COURT_RENTAL/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("rowheader", { name: "Badminton", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator('summary[aria-label="Filter"]:visible').click();
  await expect(page.getByLabel("Services", { exact: true })).toHaveValue(
    "COURT_RENTAL",
  );
  await page
    .getByLabel("Services", { exact: true })
    .selectOption("GROUP_COURSE");
  await expect(page).toHaveURL(/service=GROUP_COURSE/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Status", { exact: true }).selectOption("inactive");
  await expect(page).toHaveURL(/status=inactive/);
  await page.getByLabel("Search", { exact: true }).fill("basket");
  await expect(
    page.getByRole("rowheader", { name: "Basketball", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search", { exact: true }).fill("gym");
  await expect(page.getByRole("rowheader")).toHaveCount(0);
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  expect(new URL(page.url()).search).toBe("");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `../.impeccable/review/sports-service-filter-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

const invoiceId = "11111111-1111-4111-8111-111111111111";
async function invoiceFixture(page: Page, status = "PAID") {
  await managerLayoutFixture(page);
  const summary = {
    invoiceId,
    invoiceNumber: "INV-2026-000027",
    memberId: "member",
    memberName: "Alex Nguyen",
    memberEmail: "alex.nguyen.with.a.long.email@example.com",
    status,
    fulfillmentOutcome: status === "PAID" ? "FULFILLED" : "NONE",
    totalAmount: 500000,
    outstanding: status === "PAID" ? 0 : 500000,
    pointsSpent: 100,
    cashAmount: 400000,
    issuedAt: "2026-10-21T15:57:00Z",
    checkoutExpiresAtUtc: null,
  };
  await page.route("**/api/invoices**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("receipt.pdf"))
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.4\n%%EOF",
      });
    if (path === "/api/invoices")
      return route.fulfill({
        json: { items: [summary], totalCount: 1, page: 1, pageSize: 20 },
      });
    return route.fulfill({
      json: {
        summary,
        items: [
          {
            itemId: "class",
            itemType: "CLASS_PACKAGE",
            description: "Badminton foundations and court movement enrollment",
            sportName: "Badminton",
            classId: 21,
            quantity: 1,
            unitPrice: 300000,
            lineAmount: 300000,
          },
          {
            itemId: "gym",
            itemType: "MEMBERSHIP",
            description: "Gym membership for 30 days",
            sportName: "Gym",
            quantity: 1,
            unitPrice: 200000,
            lineAmount: 200000,
          },
        ],
        payments:
          status === "PAID"
            ? [
                {
                  paymentId: "paid",
                  method: "VNPay",
                  status: "SUCCESS",
                  paidAt: "2026-10-21T16:00:00Z",
                  referenceCode: "VNP-20261021-000027",
                  amount: 400000,
                },
              ]
            : [],
        adjustments: [],
      },
    });
  });
}

for (const width of [1440, 390, 320])
  test(`compact invoice preserves purchase and payment details at ${width}px`, async ({
    page,
  }) => {
    await invoiceFixture(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/manager/finance");
    await page.getByRole("button", { name: "Details", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Invoice", exact: true });
    await expect(
      dialog.getByRole("heading", {
        name: "Badminton foundations and court movement enrollment",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Payment method", { exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByText("Paid", { exact: true })).toHaveCount(1);
    await expect(dialog.getByText("Fulfilled", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Gym", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Badminton", { exact: true })).toHaveCount(0);
    await expect(
      dialog.getByRole("region", { name: "Invoice details", exact: true }),
    ).toBeVisible();
    for (const label of [
      "Invoice information",
      "Invoice contents",
      "Invoice number",
      "Amount outstanding",
      "Unit price",
      "Class ID",
      "Quantity",
    ])
      await expect(dialog.getByText(label, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Payment has been recorded/)).toHaveCount(0);
    await expect(
      dialog.getByText("INV-2026-000027", { exact: true }),
    ).toHaveCount(1);
    await expect(
      dialog.getByText("Alex Nguyen", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("VNP-20261021-000027", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole("list", { name: "Purchased services" })
        .locator(":scope > li"),
    ).toHaveCount(2);
    await expect(dialog.getByText("500,000", { exact: false })).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `../.impeccable/review/invoice-compact-${width}.png`,
      animations: "disabled",
    });
    if (width < 768) {
      await dialog
        .getByText("VNP-20261021-000027", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../.impeccable/review/invoice-compact-${width}-payment.png`,
        animations: "disabled",
      });
    }
    const downloaded = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    expect((await downloaded).suggestedFilename()).toBe("INV-2026-000027.pdf");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

test("unpaid invoice has no paid receipt or transaction and retains its status", async ({
  page,
}) => {
  await invoiceFixture(page, "ISSUED");
  await page.goto("/manager/finance");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invoice", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Download PDF" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Awaiting payment", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Transaction reference", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog
      .getByRole("list", { name: "Purchased services" })
      .locator(":scope > li"),
  ).toHaveCount(2);
});

test("invoice list restores cards, visible exports and server pagination", async ({
  page,
}) => {
  await invoiceFixture(page);
  const requestedPages: string[] = [];
  await page.route("**/api/invoices?**", (route) => {
    const current =
      new URL(route.request().url()).searchParams.get("page") ?? "1";
    requestedPages.push(current);
    return route.fulfill({
      json: {
        items: Array.from({ length: current === "1" ? 10 : 1 }, (_, index) => ({
          invoiceId: `${invoiceId.slice(0, -2)}${String(index + 1).padStart(2, "0")}`,
          invoiceNumber: `INV-2026-${current === "1" ? "0000" : "0001"}${String(index + 1).padStart(2, "0")}`,
          memberName:
            index === 0
              ? "Alex Nguyen with a longer display name"
              : "Linh Tran",
          memberEmail: "alex.nguyen.with.a.long.email@example.com",
          totalAmount: index === 0 ? 1500000 : 300000,
          status: index === 1 ? "ISSUED" : "PAID",
          issuedAt: "2026-10-21T15:57:00Z",
        })),
        totalCount: 11,
        page: Number(current),
        pageSize: 10,
      },
    });
  });
  await page.goto("/manager/finance");
  await expect(
    page.getByRole("table", { name: "Invoices", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Open Details to view purchased services/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Details", exact: true }),
  ).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toHaveCount(9);
  await expect(
    page.getByRole("button", { name: "Print PDF", exact: true }),
  ).toHaveCount(9);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../.impeccable/review/invoice-list-restored-${width}.png`,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Details", exact: true }),
  ).toHaveCount(1);
  expect(requestedPages).toContain("2");
});

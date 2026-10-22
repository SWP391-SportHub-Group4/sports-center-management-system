import { expect, test, type Page } from "@playwright/test";

const id = "22222222-2222-4222-8222-222222222222";
const staffId = "33333333-3333-4333-8333-333333333333";
const paged = (items: unknown[]) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
});

async function install(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "desk-token"),
  );
  const writes: { path: string; body: unknown }[] = [];
  let status = "OPEN";
  let assigned = false;
  let reconciled = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: staffId,
        email: "desk@example.com",
        fullName: "Receptionist",
        role: "RECEPTIONIST",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (request.method() === "POST") {
      writes.push({
        path,
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (path.endsWith("/assign")) {
        assigned = true;
        status = "ASSIGNED";
      }
      if (path.endsWith("/progress")) status = "IN_PROGRESS";
      if (path.endsWith("/close")) status = "CLOSED";
      if (path.endsWith("/retry")) reconciled = true;
      return json({ state: "FULFILLED" });
    }
    if (path === "/api/member-support-requests/assignees")
      return json([
        {
          userId: staffId,
          name: "Desk handler",
          email: "desk@example.com",
          role: "Receptionist",
        },
      ]);
    if (path === "/api/member-support-requests/queue")
      return json(
        paged([
          {
            requestId: id,
            memberId: id,
            category: "GENERAL",
            subject: "Help with membership",
            description: "Please review my membership",
            status,
            createdAt: "2030-01-01T01:00:00Z",
            assignedToUserId: assigned ? staffId : null,
          },
        ]),
      );
    if (path === "/api/front-desk/payment-reconciliation")
      return json(
        paged(
          reconciled
            ? []
            : [
                {
                  invoiceId: id,
                  invoiceNumber: "INV-LATE-001",
                  memberId: id,
                  memberName: "Late payment member",
                  paymentAttemptId: id,
                  verifiedEventId: id,
                  amount: 100000,
                  paidAtUtc: "2026-10-14T02:00:00Z",
                  holdExpiresAtUtc: "2026-10-14T01:59:00Z",
                  state: "ReconciliationRequired",
                  lastError: null,
                },
              ],
        ),
      );
    if (path === "/api/invoices" || path === "/api/users")
      return json(paged([]));
    return json([]);
  });
  return writes;
}

test("desk assigns, updates and closes support from the queue", async ({
  page,
}) => {
  const writes = await install(page);
  await page.goto("/receptionist/support");
  await page.getByLabel("Assign to").selectOption(staffId);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Help with membership.*ASSIGNED/ }),
  ).toBeVisible();
  await page
    .getByLabel("Progress or resolution")
    .fill("Checking the membership");
  await page.getByRole("button", { name: "Update progress" }).click();
  await expect(
    page.getByRole("heading", { name: /Help with membership.*IN PROGRESS/ }),
  ).toBeVisible();
  await page.getByLabel("Progress or resolution").fill("Membership corrected");
  await page.getByRole("button", { name: "Close request" }).click();
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(
    page.getByRole("heading", { name: /Help with membership.*CLOSED/ }),
  ).toBeVisible();
  expect(writes.map((x) => x.path.split("/").at(-1))).toEqual([
    "assign",
    "progress",
    "close",
  ]);
});

test("desk retries an unfulfilled payment after hold expiry", async ({
  page,
}) => {
  const writes = await install(page);
  await page.goto("/receptionist/payment-reconciliation");
  await expect(page.getByText("INV-LATE-001")).toBeVisible();
  await expect(page.getByText("Paid, service not delivered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Verify / retry fulfillment" })
    .click();
  await expect(
    page.getByText("No payment attempts currently need follow-up."),
  ).toBeVisible();
  expect(writes[0].path).toBe(
    `/api/front-desk/payment-reconciliation/${id}/retry`,
  );
});

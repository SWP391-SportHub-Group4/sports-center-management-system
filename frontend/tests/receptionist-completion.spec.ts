import { expect, test, type Page } from "@playwright/test";
import { installSupport } from "./helpers/support";

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
      if (path.endsWith("/retry")) reconciled = true;
      return json({ state: "FULFILLED" });
    }
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

test("desk claims, updates and completes support from the queue", async ({
  page,
}) => {
  const { writes } = await installSupport(page, { role: "RECEPTIONIST" });
  await page.goto("/receptionist/support");
  const row = page.getByRole("button", { name: /Help with membership/ });
  await expect(row).toContainText("Unassigned");
  await page.getByRole("button", { name: "Assign to me" }).click();
  await expect(row).toContainText("Assigned");
  await page
    .getByRole("textbox", { name: "Progress note", exact: true })
    .fill("Checking the membership");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(row).toContainText("In progress");
  await page.getByRole("tab", { name: "Mark as done" }).click();
  await page
    .getByRole("textbox", { name: "Resolution note", exact: true })
    .fill("Membership corrected");
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  await page.getByRole("button", { name: "Confirm done" }).click();
  await expect(row).toContainText("Done");
  expect(writes.map((x) => x.path.split("/").at(-1))).toEqual([
    "assign",
    "progress",
    "done",
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

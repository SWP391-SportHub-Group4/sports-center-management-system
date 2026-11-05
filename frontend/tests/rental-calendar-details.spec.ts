import { test, expect } from "@playwright/test";
const member = "11111111-1111-4111-8111-111111111111",
  rental = "22222222-2222-4222-8222-222222222222",
  invoice = "33333333-3333-4333-8333-333333333333";
for (const role of ["manager", "receptionist"]) {
  test(`Rental schedule drawer shows aligned invoice information for ${role}`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-11-04T05:00:00Z"));
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "rental-fixture"),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "staff",
            role: role === "manager" ? "CENTER_MANAGER" : "RECEPTIONIST",
            fullName: "Staff",
            email: "staff@example.com",
            sportIds: [],
          },
        });
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === "/api/system-settings")
        return route.fulfill({
          json: [
            { key: "center.opening_minutes", value: "360" },
            { key: "center.closing_minutes", value: "1320" },
          ],
        });
      if (path.endsWith("/court-schedule"))
        return route.fulfill({
          json: [
            {
              sourceType: "COURT_RENTAL",
              sourceId: rental,
              roomId: 1,
              title: "Court rental",
              memberId: member,
              memberName: "Alex Member",
              status: "CANCELLED",
              cancellationReason: "Manager maintenance cancellation",
              startAtUtc: "2026-11-04T07:00:00Z",
              endAtUtc: "2026-11-04T08:00:00Z",
              participants: [],
            },
          ],
        });
      if (path === "/api/rooms")
        return route.fulfill({
          json: [
            {
              roomId: 1,
              name: "Court A",
              isActive: true,
              allowRental: true,
              capacity: 4,
            },
          ],
        });
      if (path.endsWith("/court-rentals")) {
        const row = {
          courtRentalId: rental,
          invoiceId: invoice,
          status: "CANCELLED",
        };
        return route.fulfill({
          json:
            role === "manager"
              ? { items: [row], page: 1, pageSize: 100, totalCount: 1 }
              : [row],
        });
      }
      if (path === `/api/invoices/${invoice}`)
        return route.fulfill({
          json: {
            summary: {
              invoiceId: invoice,
              invoiceNumber: "INV-2026-000029",
              status: "PAID",
              fulfillmentOutcome: "FULFILLED",
              outstanding: 0,
              reconciliationRequired: false,
            },
          },
        });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/${role}/schedule`);
    await page
      .getByRole("button")
      .filter({ hasText: "Court rental" })
      .last()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText("INV-2026-000029", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("No outstanding balance", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Manager maintenance cancellation", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByText("Rental status:", { exact: true }),
    ).toHaveCount(0);
    await expect(drawer.getByText("Renter:", { exact: true })).toHaveCount(0);
    await expect(
      drawer.getByRole("link", { name: "Open member invoices", exact: true }),
    ).toHaveAttribute("href", `/${role}/members/${member}?tab=invoices`);
    await page.screenshot({
      path: testInfo.outputPath("rental-drawer.png"),
      animations: "disabled",
    });
  });
}

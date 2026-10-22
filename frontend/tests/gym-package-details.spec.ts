import { expect, test } from "@playwright/test";

test("Gym details show payment time, expiry time and dated check-ins", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "member-1",
        fullName: "Member",
        email: "member@example.com",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === "/api/members/me/packages")
      return json([
        {
          memberPackageId: "gym-package-1",
          packageId: 1,
          packageName: "Gym 1 month",
          startDate: "2026-10-01",
          endDate: "2026-11-30",
          status: "ACTIVE",
          isUsable: true,
          invoiceItemId: "invoice-item-1",
          sessionLimit: null,
        },
      ]);
    if (path === "/api/invoices/by-item/invoice-item-1")
      return json({
        summary: { paidAtUtc: "2026-09-30T09:05:07Z" },
        items: [],
        payments: [],
        adjustments: [],
      });
    if (path === "/api/members/me/gym-checkins")
      return json({
        items: [
          { checkInId: "visit-1", checkInTime: "2026-10-20T07:06:05Z" },
          { checkInId: "visit-2", checkInTime: "2026-10-10T01:02:03Z" },
          { checkInId: "old-visit", checkInTime: "2026-09-29T01:02:03Z" },
        ],
        page: 1,
        pageSize: 100,
        totalCount: 3,
      });
    if (path === "/api/members/me/enrollments")
      return json({ items: [], totalCount: 0 });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    return json([]);
  });

  await page.goto("/member/services?view=owned&type=gym");
  await expect(page.getByText("Usage history")).toHaveCount(0);
  await page.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(/gymPackage=gym-package-1/);
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(
    page.locator("strong").filter({ hasText: "30/09/2026, 16:05:07" }),
  ).toBeVisible();
  await expect(page.getByText("30/11/2026 · 23:59:59")).toBeVisible();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("20/10/2026");
  await expect(rows.nth(1)).toContainText("14:06:05");
  await expect(rows.nth(2)).toContainText("10/10/2026");
  await expect(rows.nth(2)).toContainText("08:02:03");
  const firstShade = await rows
    .nth(1)
    .evaluate((row) => getComputedStyle(row).backgroundColor);
  const secondShade = await rows
    .nth(2)
    .evaluate((row) => getComputedStyle(row).backgroundColor);
  expect(firstShade).not.toBe(secondShade);
  await expect(page.getByText("29/09/2026")).toHaveCount(0);
});

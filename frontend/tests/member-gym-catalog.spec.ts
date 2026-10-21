import { expect, test } from "@playwright/test";

for (const status of ["ACTIVE", "PENDING_PAYMENT", "NONE"]) {
  test(`Gym catalog remains visible with ${status} membership`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "fixture-token");
      localStorage.setItem("sporthub_lang", "en");
    });
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") writes.push(path);
      let json: unknown = [];
      if (path === "/api/users/me") {
        json = {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Member fixture",
          email: "member@example.test",
          role: "MEMBER",
          sportIds: [],
        };
      } else if (path === "/api/members/me/packages") {
        json =
          status === "NONE"
            ? []
            : [
                {
                  memberPackageId: "22222222-2222-4222-8222-222222222222",
                  packageId: 1,
                  packageName: "Gym monthly",
                  startDate: "2026-10-01",
                  endDate: "2026-10-30",
                  status,
                  isUsable: status === "ACTIVE",
                },
              ];
      } else if (path === "/api/membership-packages") {
        json = [
          {
            packageId: 1,
            name: "Gym monthly",
            price: 600000,
            durationDays: 30,
            sessionLimit: null,
            description: "Existing package",
            isActive: true,
          },
          {
            packageId: 2,
            name: "Tập gym 3 tháng",
            price: 300000,
            durationDays: 30,
            sessionLimit: null,
            description: "New package from manager",
            isActive: true,
          },
          {
            packageId: 3,
            name: "Discontinued Gym",
            price: 100000,
            durationDays: 14,
            sessionLimit: null,
            description: null,
            isActive: false,
          },
          {
            packageId: 4,
            name: "Gym PT recovery",
            price: 700000,
            durationDays: 30,
            sessionLimit: null,
            description: "Membership names do not determine the service type",
            isActive: true,
          },
        ];
      } else if (path === "/api/classes") {
        json = { items: [], totalCount: 0, page: 1, pageSize: 2 };
      } else if (path === "/api/wallet/me") {
        json = { availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 };
      } else if (path.endsWith("unread-count")) {
        json = { count: 0 };
      }
      return route.fulfill({ json });
    });
    await page.goto("/member/services?section=gym&view=explore");
    const catalog = page.getByRole("region", {
      name: "Gym Membership",
      exact: true,
    });
    await expect(
      page.getByRole("heading", { name: "Gym Membership", exact: true }),
    ).toBeVisible();
    const newPackage = catalog
      .locator("article")
      .filter({ hasText: "Tập gym 3 tháng" });
    await expect(
      newPackage.getByRole("heading", { name: "Tập gym 3 tháng" }),
    ).toBeVisible();
    await expect(newPackage).toContainText("300,000");
    await expect(newPackage).toContainText("30");
    await expect(
      newPackage.getByRole("button", { name: "Choose plan", exact: true }),
    ).toBeVisible();
    await expect(
      catalog.getByText("Discontinued Gym", { exact: true }),
    ).toHaveCount(0);
    await expect(
      catalog.getByRole("heading", { name: "Gym PT recovery", exact: true }),
    ).toHaveCount(0);
    const existing = catalog
      .locator("article")
      .filter({ hasText: "Gym monthly" });
    await expect(
      existing.getByRole("button", { name: "Choose plan", exact: true }),
    ).toHaveCount(status === "NONE" ? 1 : 0);
    if (status === "ACTIVE") {
      await expect(
        existing.getByRole("button", { name: "Renew plan" }),
      ).toBeEnabled();
    }
    if (status !== "NONE") {
      await expect(
        status === "ACTIVE"
          ? page.getByText(/^In use · until/)
          : existing.getByRole("button", { name: "Continue payment" }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath("desktop.png"),
      animations: "disabled",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      newPackage.getByRole("heading", { name: "Tập gym 3 tháng" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("mobile.png"),
      animations: "disabled",
      fullPage: true,
    });
    expect(writes).toEqual([]);
  });
}

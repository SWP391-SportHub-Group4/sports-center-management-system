import { expect, test } from "@playwright/test";
import { assertEnglishOnlyShell } from "./helpers/english";

const invoiceId = "33333333-3333-4333-8333-333333333333";

for (const outcome of ["FULFILLED", "COMPENSATED", "RECONCILIATION_REQUIRED"]) {
  test(`Invoice keeps its purchase snapshot and server outcome ${outcome}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "fixture-token");
      localStorage.setItem("sporthub_lang", "vi");
    });
    const writes: string[] = [];
    const catalogReads: string[] = [];
    const summary = {
      invoiceId,
      invoiceNumber: "INV-SNAPSHOT-001",
      memberId: "member-1",
      status: "PAID",
      totalAmount: 650000,
      outstanding: 0,
      pointsSpent: 50,
      cashAmount: 600000,
      fulfillmentOutcome: outcome,
      reconciliationRequired: outcome === "RECONCILIATION_REQUIRED",
      checkoutExpiresAtUtc: null,
    };
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") writes.push(path);
      if (/\/api\/(classes|membership-packages|rooms)(\/|$)/.test(path))
        catalogReads.push(path);
      let json: unknown = [];
      if (path === "/api/users/me")
        json = {
          userId: "manager-1",
          fullName: "Manager fixture",
          email: "manager@example.test",
          role: "CENTER_MANAGER",
          sportIds: [],
        };
      else if (path === "/api/invoices")
        json = { items: [summary], totalCount: 1 };
      else if (path === `/api/invoices/${invoiceId}`)
        json = {
          summary,
          items: [
            {
              itemId: "item-1",
              itemType: "MEMBERSHIP",
              description: "Gói Gym tại thời điểm mua",
              lineAmount: 650000,
            },
          ],
          adjustments: [],
        };
      else if (path.endsWith("unread-count")) json = { count: 0 };
      return route.fulfill({ json });
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/manager/finance?tab=invoices");
      await assertEnglishOnlyShell(page);
      const trigger = page.getByRole("button", {
        name: "Details",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Invoice", exact: true });
      await expect(
        dialog.getByText("Gói Gym tại thời điểm mua", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.locator("li").filter({ hasText: "Gói Gym tại thời điểm mua" }),
      ).toContainText("650,000");
      await expect(dialog).toContainText("600,000");
      await expect(dialog).toContainText("50 points");
      if (outcome === "COMPENSATED")
        await expect(dialog).toContainText(
          "Payment refunded to wallet; service was not fulfilled.",
        );
      if (outcome === "RECONCILIATION_REQUIRED")
        await expect(dialog).toContainText("reconciliation");
      await expect(
        dialog.getByRole("button", { name: "Confirm payment" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`invoice-${width}.png`),
        animations: "disabled",
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    expect(catalogReads).toEqual([]);
    expect(writes).toEqual([]);
  });
}

for (const pt of [false, true]) {
  test(`Coach mobile shell preserves assigned navigation, PT ${pt}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "fixture-token");
      localStorage.setItem("sporthub_lang", "vi");
    });
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json:
          path === "/api/users/me"
            ? {
                userId: "coach-1",
                role: "COACH",
                fullName: "Coach fixture",
                email: "coach@example.test",
                sportIds: [1],
                isPersonalTrainer: pt,
                status: "ACTIVE",
                hasPassword: true,
              }
            : path.endsWith("unread-count")
              ? { count: 0 }
              : [],
      });
    });
    await page.goto("/account");
    await assertEnglishOnlyShell(page);
    const header = page.getByRole("banner");
    if (!pt)
      await header
        .getByRole("button", { name: "Open navigation menu" })
        .click();
    const navigation = pt ? header : page;
    await expect(
      navigation.getByRole("link", {
        name: pt ? "PT schedule" : "Teaching schedule",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("link", {
        name: pt ? "Assigned members" : "Students",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath("coach-mobile.png"),
      animations: "disabled",
      fullPage: true,
    });
  });
}

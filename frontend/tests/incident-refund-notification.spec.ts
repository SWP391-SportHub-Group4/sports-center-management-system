import { test, expect } from "@playwright/test";

for (const affected of [true, false]) {
  test(`Incident announcement refund action (${affected ? "affected" : "unaffected"} member)`, async ({
    page,
  }, testInfo) => {
    const id = "11111111-1111-4111-8111-111111111111";
    const actionUrl = "/member/finance?tab=refunds#center-cancellation-refunds";
    const notice = {
      notificationId: id,
      sourceEventType: "INCIDENT_CREATED",
      sourceEntityId: id,
      message:
        "A center incident has been confirmed. Location: Court A. Reason: Maintenance.",
      status: "READ",
      sentAt: "2026-11-05T06:00:00Z",
      actionUrl: affected ? actionUrl : null,
    };
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "incident-fixture"),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "member",
            role: "MEMBER",
            fullName: "Member",
            email: "member@example.com",
            sportIds: [],
          },
        });
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === "/api/wallet/balance")
        return route.fulfill({ json: { availablePoints: 0 } });
      if (path === "/api/notifications/inbox")
        return route.fulfill({
          json: { items: [notice], totalCount: 1, page: 1, pageSize: 25 },
        });
      if (path === `/api/notifications/${id}`)
        return route.fulfill({ json: notice });
      if (path === "/api/refunds/center-cancellations/mine")
        return route.fulfill({
          json: ["Court A", "Court B"].map((name, i) => ({
            invoiceItemId: `item-${i}`,
            invoiceId: `invoice-${i}`,
            kind: "CourtRental",
            name,
            cancelledAtUtc: "2026-11-05T06:00:00Z",
            refundPoints: 100,
            remainingValueVnd: 100000,
            autoRefundAtUtc: "2026-11-07T06:00:00Z",
            status: "Offer",
            creditedPoints: 0,
          })),
        });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/notifications?message=${id}`);
    await expect(
      page.getByRole("heading", {
        name: "An update about a center disruption",
      }),
    ).toBeVisible();
    const action = page.getByRole("link", {
      name: "Choose refund method",
      exact: true,
    });
    if (!affected) {
      await expect(action).toHaveCount(0);
      return;
    }
    await expect(action).toHaveAttribute("href", actionUrl);
    await expect(page.locator("[data-startup-loader]")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("incident-refund-action.png"),
      fullPage: true,
    });
    await action.click();
    await expect(page).toHaveURL(
      /\/member\/finance\?tab=refunds#center-cancellation-refunds$/,
    );
    const choices = page.getByRole("region", {
      name: "Refunds for cancellations by the center",
    });
    await expect(choices).toBeVisible();
    await expect(
      choices.getByRole("button", { name: /Receive .* now/ }),
    ).toHaveCount(2);
    await expect(
      choices.getByRole("link", { name: "Request a refund instead" }),
    ).toHaveCount(2);
  });
}

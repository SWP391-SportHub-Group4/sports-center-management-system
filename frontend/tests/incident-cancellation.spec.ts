import { test, expect } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";

for (const timing of ["past", "ongoing", "future"] as const) {
  test(`Cancel button follows incident end time (${timing})`, async ({
    page,
  }) => {
    const now = new Date("2026-11-05T06:00:00Z");
    await page.clock.install({ time: now });
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "incident-fixture"),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "manager",
            role: "CENTER_MANAGER",
            fullName: "Manager",
            email: "manager@example.com",
            sportIds: [],
          },
        });
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === `/api/manager/incidents/${id}`)
        return route.fulfill({
          json: {
            incidentId: id,
            scope: "ROOM",
            roomId: 1,
            roomName: "Court A",
            reason: "Maintenance",
            startAtUtc:
              timing === "future"
                ? "2026-11-06T06:00:00Z"
                : "2026-11-04T06:00:00Z",
            endAtUtc:
              timing === "past"
                ? "2026-11-05T05:59:59Z"
                : timing === "ongoing"
                  ? "2026-11-05T06:01:00Z"
                  : "2026-11-06T07:00:00Z",
            createdAtUtc: "2026-11-04T05:00:00Z",
          },
        });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/manager/incidents/${id}`);
    const button = page.getByRole("button", {
      name: "Cancel incident",
      exact: true,
    });
    if (timing === "past") {
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS("opacity", "0.55");
      await expect(button).toHaveCSS("cursor", "not-allowed");
    } else {
      await expect(button).toBeEnabled();
      if (timing === "ongoing") {
        await button.click();
        await page.clock.fastForward(60000);
        await expect(button).toBeDisabled();
        await expect(
          page.getByRole("button", { name: "Yes", exact: true }),
        ).toBeDisabled();
      }
    }
  });
}

for (const center of [false, true]) {
  test(`Reopening announcement has the approved copy and no action button (${center ? "center" : "court"})`, async ({
    page,
  }, testInfo) => {
    const title = center
      ? "The center has reopened"
      : "Court A has reopened";
    const body = center
      ? "The center has resumed operations as of 05/11/2026 13:00. You can check availability and book a court again. Cancelled bookings will not be restored automatically. Please check the status of courts and rooms before your visit."
      : "Court A has resumed operations as of 05/11/2026 13:00. You can check availability and book the court as needed. Cancelled bookings will not be restored automatically. Please check the status of courts and rooms before your visit.";
    const notice = {
      notificationId: id,
      sourceEventType: "INCIDENT_CANCELLED",
      sourceEntityId: id,
      message: title + "\n\n" + body,
      status: "READ",
      sentAt: "2026-11-05T06:00:00Z",
      actionUrl: null,
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
      if (path === "/api/notifications/inbox")
        return route.fulfill({
          json: { items: [notice], totalCount: 1, page: 1, pageSize: 25 },
        });
      if (path === `/api/notifications/${id}`)
        return route.fulfill({ json: notice });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/notifications?message=${id}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    await expect(page.locator("[data-startup-loader]")).toHaveCount(0);
    const reader = page.getByRole("region", { name: title });
    await expect(reader.getByRole("link")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("reopening-notice.png"),
      fullPage: true,
    });
  });
}

test("Manager confirms cancellation, can dismiss or retry errors, and sees cancelled state", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "incident-fixture"),
  );
  let cancelled = false;
  let attempts = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          email: "manager@example.com",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === `/api/manager/incidents/${id}/cancel`) {
      attempts++;
      if (attempts === 1)
        return route.fulfill({
          status: 409,
          json: { detail: "Please try again.", code: "conflict" },
        });
      cancelled = true;
      return route.fulfill({ status: 204 });
    }
    if (path === `/api/manager/incidents/${id}`)
      return route.fulfill({
        json: {
          incidentId: id,
          scope: "ROOM",
          roomId: 1,
          roomName: "Court A",
          reason: "Court maintenance",
          startAtUtc: "2026-11-18T11:00:00Z",
          endAtUtc: "2026-11-18T12:00:00Z",
          createdAtUtc: "2026-11-04T05:00:00Z",
          cancelledAtUtc: cancelled ? "2026-11-05T06:00:00Z" : null,
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto(`/manager/incidents/${id}`);
  const button = page.getByRole("button", {
    name: "Cancel incident",
    exact: true,
  });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Cancel incident" });
  await expect(
    dialog.getByText("Are you sure you want to cancel this incident?"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "No", exact: true }).click();
  expect(attempts).toBe(0);
  await expect(dialog).toBeHidden();
  await button.click();
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(button).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("confirmation-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("confirmation-mobile.png"),
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Incident cancelled", { exact: true }),
  ).toBeVisible();
  await expect(button).toHaveCount(0);
  expect(attempts).toBe(2);
});

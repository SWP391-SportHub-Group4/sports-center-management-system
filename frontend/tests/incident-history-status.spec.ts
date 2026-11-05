import { test, expect } from "@playwright/test";

test("Incident history defaults to Confirmed and combines status with scope/date filters", async ({
  page,
}, testInfo) => {
  const records = [
    {
      incidentId: "11111111-1111-4111-8111-111111111111",
      scope: "ROOM",
      roomId: 1,
      roomName: "Court A",
      reason: "Confirmed maintenance",
      cancelledAtUtc: null,
    },
    {
      incidentId: "22222222-2222-4222-8222-222222222222",
      scope: "ROOM",
      roomId: 1,
      roomName: "Court A",
      reason: "Cancelled court maintenance",
      cancelledAtUtc: "2026-11-05T06:00:00Z",
    },
    {
      incidentId: "33333333-3333-4333-8333-333333333333",
      scope: "CENTER",
      roomId: null,
      roomName: null,
      reason: "Cancelled center maintenance",
      cancelledAtUtc: "2026-11-05T06:00:00Z",
    },
  ].map((row) => ({
    ...row,
    startAtUtc: "2026-11-06T06:00:00Z",
    endAtUtc: "2026-11-06T07:00:00Z",
    createdAtUtc: "2026-11-04T06:00:00Z",
  }));
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "incident-fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/manager/incidents")
      return route.fulfill({
        json: { items: records, page: 1, pageSize: 100, totalCount: 3 },
      });
    if (path === "/api/rooms")
      return route.fulfill({
        json: [{ roomId: 1, name: "Court A", capacity: 4, isActive: true }],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/incidents");
  await expect(page.locator("[data-startup-loader]")).toHaveCount(0);
  const open = page.getByRole("button", {
    name: "Incident history",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Incident history",
    exact: true,
  });
  const status = dialog.getByLabel("Status", { exact: true });
  await expect(status).toHaveValue("CONFIRMED");
  await expect(
    dialog.getByText("Confirmed maintenance", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Cancelled court maintenance", { exact: true }),
  ).toHaveCount(0);
  await status.selectOption("CANCELLED");
  await expect(
    dialog.getByText("Confirmed maintenance", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Cancelled court maintenance", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Cancelled center maintenance", { exact: true }),
  ).toBeVisible();
  const scope = dialog.getByRole("combobox", { name: "Incident scope" });
  await scope.fill("Court A");
  await dialog.getByRole("option", { name: "Court A", exact: true }).click();
  await expect(
    dialog.getByText("Cancelled center maintenance", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("Start", { exact: true }).fill("2026-11-07");
  await expect(
    dialog.getByText("Cancelled court maintenance", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("Start", { exact: true }).fill("");
  await expect(
    dialog.getByText("Cancelled court maintenance", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("history-status-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(status).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("history-status-mobile.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await open.click();
  await expect(status).toHaveValue("CONFIRMED");
  await expect(
    dialog.getByText("Confirmed maintenance", { exact: true }),
  ).toBeVisible();
});

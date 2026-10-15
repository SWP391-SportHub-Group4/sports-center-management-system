import { expect, test, type Page } from "@playwright/test";

const rentalId = "11111111-2222-4333-8444-555555555555";
const exportId = "22222222-2222-4333-8444-555555555555";

async function setup(
  page: Page,
  options: { error?: string; status?: string; role?: string } = {},
) {
  const writes: { path: string; method: string; body: unknown }[] = [];
  let deleted = false;
  let cancelled = false;
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({
        path,
        method: request.method(),
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (options.error)
        return route.fulfill({
          status: options.error === "server_error" ? 500 : 409,
          json: { error: options.error, message: "Rejected" },
        });
      if (path.endsWith("/cancel")) cancelled = true;
      else deleted = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: rentalId,
          fullName: "Manager fixture",
          email: "manager@example.com",
          role: options.role ?? "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/room-types")
      return route.fulfill({
        json: deleted
          ? []
          : [{ roomTypeId: 3, name: "Rental court", sportIds: [1] }],
      });
    if (path === "/api/rooms")
      return route.fulfill({
        json: deleted
          ? []
          : [
              {
                roomId: 7,
                name: "Court A",
                roomTypeId: 3,
                capacity: 10,
                isActive: true,
              },
            ],
      });
    if (path === "/api/sports" || path === "/api/manager/sports")
      return route.fulfill({
        json: [
          {
            sportId: 1,
            code: "badminton",
            name: "Badminton",
            isActive: true,
            services: [{ serviceType: "COURT_RENTAL", isEnabled: true }],
          },
        ],
      });
    if (path === "/api/manager/court-rates")
      return route.fulfill({
        json: deleted
          ? []
          : [
              {
                rateId: 9,
                roomTypeId: 3,
                sportId: 1,
                daysOfWeek: "MON,TUE",
                startTimeLocal: "06:00",
                endTimeLocal: "22:00",
                pricePerHour: 100000,
                isActive: true,
              },
            ],
      });
    if (path === "/api/reports/exports")
      return route.fulfill({
        json: {
          items: deleted
            ? []
            : [
                {
                  reportExportId: exportId,
                  reportType: "REVENUE_DIMENSIONS",
                  format: "Csv",
                  status: "COMPLETED",
                  createdAt: "2026-10-15T00:00:00Z",
                  expiresAt: "2030-10-15T00:00:00Z",
                  rowCount: 4,
                },
              ],
          page: 1,
          pageSize: 20,
          totalCount: deleted ? 0 : 1,
        },
      });
    if (path.endsWith("/court-schedule"))
      return route.fulfill({
        json: [
          {
            sourceType: "COURT_RENTAL",
            sourceId: rentalId,
            title: "Court rental",
            roomId: 7,
            memberId: rentalId,
            memberName: "Member fixture",
            status: cancelled ? "CANCELLED" : (options.status ?? "CONFIRMED"),
            startAtUtc: "2026-10-15T11:00:00Z",
            endAtUtc: "2026-10-15T12:00:00Z",
            participants: [],
          },
        ],
      });
    if (path.includes("notifications")) return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  return writes;
}

for (const [route, title, endpoint] of [
  ["training-rooms", "Delete room", "/api/rooms/7"],
  ["room-types", "Delete room type", "/api/manager/room-types/3"],
  ["court-rates", "Delete court rate", "/api/manager/court-rates/9"],
  [
    "reports/exports",
    "Delete exported report",
    `/api/reports/exports/${exportId}`,
  ],
]) {
  test(`${route}: delete requires confirmation and reloads after success`, async ({
    page,
  }) => {
    const writes = await setup(page);
    await page.goto(`/manager/${route}`);
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    expect(writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(writes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([{ path: endpoint, method: "DELETE", body: null }]);
  });
}

for (const [route, code, message] of [
  ["training-rooms", "room_in_use", "Deactivate it instead"],
  ["room-types", "room_type_in_use", "Remove those references"],
]) {
  test(`${route}: referenced records remain visible when deletion is rejected`, async ({
    page,
  }) => {
    await setup(page, { error: code });
    await page.goto(`/manager/${route}`);
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(message);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Delete", exact: true }).first(),
    ).toBeVisible();
  });
}

test("rental cancellation requires a reason, sends it trimmed, and refreshes the schedule", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/manager/schedule?date=2026-10-15&view=day");
  await page
    .getByRole("button", { name: /Court rental/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Cancel rental", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cancel court rental",
    exact: true,
  });
  const confirm = dialog.getByRole("button", {
    name: "Cancel rental",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Reason").fill("   ");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Reason").fill("  Center maintenance  ");
  expect(writes).toHaveLength(0);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    {
      path: `/api/manager/court-rentals/${rentalId}/cancel`,
      method: "POST",
      body: { reason: "Center maintenance" },
    },
  ]);
  await page
    .getByRole("button", { name: /Court rental/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel rental", exact: true }),
  ).toHaveCount(0);
});

test("pending rentals do not offer center cancellation", async ({ page }) => {
  await setup(page, { status: "PENDING_PAYMENT" });
  await page.goto("/manager/schedule?date=2026-10-15&view=day");
  await page
    .getByRole("button", { name: /Court rental/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel rental", exact: true }),
  ).toHaveCount(0);
});

test("uncertain cancellation does not allow blind retries", async ({
  page,
}) => {
  const writes = await setup(page, { error: "server_error" });
  await page.goto("/manager/schedule?date=2026-10-15&view=day");
  await page
    .getByRole("button", { name: /Court rental/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Cancel rental", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cancel court rental",
    exact: true,
  });
  await dialog.getByLabel("Reason").fill("Maintenance");
  await dialog
    .getByRole("button", { name: "Cancel rental", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "result could not be confirmed",
  );
  await expect(
    dialog.getByRole("button", { name: "Cancel rental", exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(1);
  await dialog.getByRole("button", { name: "Close and refresh" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`confirmation stays usable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.goto("/manager/schedule?date=2026-10-15&view=day");
    await page
      .getByRole("button", { name: /Court rental/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Cancel rental", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Cancel court rental",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Reason").fill("Center maintenance");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await expect(
      dialog.getByRole("button", { name: "Cancel rental", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("confirmation.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
  });
}

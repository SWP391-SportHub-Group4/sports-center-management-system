import { expect, test } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

test("room layout stays compact and searchable across viewport sizes", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  await page.route("**/api/rooms", (route) =>
    route.fulfill({
      json: [
        {
          roomId: 1,
          name: "MMA-001",
          capacity: 12,
          roomTypeId: 3,
          isActive: true,
          allowRental: true,
          rentalBookingOpensAtUtc: "2099-10-27T17:00:00Z",
        },
        {
          roomId: 2,
          name: "Pickleball A",
          capacity: 12,
          roomTypeId: 3,
          isActive: false,
          allowRental: false,
        },
        {
          roomId: 3,
          name: "Pickleball-101",
          capacity: 12,
          roomTypeId: 3,
          isActive: true,
          allowRental: true,
        },
        {
          roomId: 4,
          name: "Multipurpose training room on the second floor",
          capacity: 24,
          roomTypeId: 3,
          isActive: true,
          allowRental: false,
        },
      ],
    }),
  );
  await page.goto("/manager/facilities");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("rowheader")).toHaveCount(4);
    if (width === 1440)
      await expect(page.getByRole("rowheader").first()).toHaveCSS(
        "text-align",
        "left",
      );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/rooms-layout-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("Pickleball");
  await expect(page.getByRole("rowheader")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("inactive");
  await expect(page.getByRole("rowheader")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Activate Pickleball A", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("manager creates a shared room and separately controls rental access", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  const rooms: Array<Record<string, unknown>> = [];
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  let failRental = false;
  await page.route("**/api/rooms**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      const room = {
        ...body,
        roomId: 91,
        roomTypeId: 51,
        sportId: null,
        activeClassCount: 0,
        isActive: true,
        allowRental: false,
      };
      rooms.push(room);
      return route.fulfill({ status: 201, json: room });
    }
    if (request.method() === "PUT" && path.endsWith("/rental-access")) {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (failRental)
        return route.fulfill({
          status: 500,
          json: {
            error: "save_failed",
            message: "Unable to update rental access. Try again.",
          },
        });
      rooms[0].allowRental = body.allowRental;
      return route.fulfill({ json: rooms[0] });
    }
    return route.fulfill({ json: rooms });
  });
  await page.goto("/manager/facilities");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/Sport/)).toHaveCount(0);
  await dialog.getByLabel(/^Name/).fill("Multipurpose Hall");
  await dialog.getByLabel(/^Capacity/).fill("20");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: "Multipurpose Hall" }),
  });
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
  expect(writes[0]).toEqual({
    path: "/api/rooms",
    body: {
      name: "Multipurpose Hall",
      capacity: 20,
      isActive: true,
      allowRental: false,
    },
  });
  await row.getByRole("button", { name: "Allow rental", exact: true }).click();
  await expect(row.getByText("Allowed", { exact: true })).toBeVisible();
  expect(writes[1]).toEqual({
    path: "/api/rooms/91/rental-access",
    body: { allowRental: true },
  });
  expect(rooms).toHaveLength(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/independent-rooms-desktop.png",
    fullPage: true,
  });
  await row
    .getByRole("button", { name: "Disable rental", exact: true })
    .click();
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
  failRental = true;
  await row.getByRole("button", { name: "Allow rental", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Unable to update rental access" }),
  ).toBeVisible();
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/independent-rooms-${width}.png`,
      fullPage: true,
    });
  }
  failRental = false;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row.getByRole("button", { name: "Allow rental", exact: true }).click();
  await expect(row.getByText("Allowed", { exact: true })).toBeVisible();
  const rates: Array<Record<string, unknown>> = [];
  await page.route("**/api/manager/court-rates", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push({ path: "/api/manager/court-rates", body });
      rates.push({ ...body, daysOfWeek: body.daysOfWeek.join(","), rateId: 1 });
      return route.fulfill({ json: rates[0] });
    }
    return route.fulfill({ json: rates });
  });
  await page.goto("/manager/facilities/91?tab=pricing");
  await page
    .getByRole("button", { name: "Create court rate", exact: true })
    .click();
  const rateDialog = page.getByRole("dialog");
  await rateDialog.getByLabel(/^Sport/).selectOption("4");
  await rateDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rateDialog).toHaveCount(0);
  expect(writes.at(-1)?.body).toMatchObject({
    roomId: 91,
    roomTypeId: 51,
    sportId: 4,
  });
});

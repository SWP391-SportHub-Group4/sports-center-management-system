import { expect, test, type Page } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

async function setup(page: Page) {
  await managerLayoutFixture(page);
  const rooms: Array<Record<string, unknown>> = [];
  const writes: Array<Record<string, unknown>> = [];
  await page.route("**/api/system-settings", (route) =>
    route.fulfill({
      json: [
        { key: "center.opening_minutes", value: "360" },
        { key: "center.closing_minutes", value: "1320" },
      ],
    }),
  );
  await page.route("**/api/rooms", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body);
      const room = {
        ...body,
        roomId: 91,
        roomTypeId: 51,
        sportId: null,
        activeClassCount: 0,
      };
      rooms.push(room);
      return route.fulfill({ status: 201, json: room });
    }
    return route.fulfill({ json: rooms });
  });
  await page.goto("/manager/facilities");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create room", exact: true });
  await dialog.getByLabel(/^Name/).fill("Shared Hall");
  await dialog.getByLabel(/^Capacity/).fill("20");
  return { writes, dialog };
}

test("room creation defaults to active with rental off", async ({ page }) => {
  const { writes, dialog } = await setup(page);
  await expect(dialog.getByRole("switch")).not.toBeChecked();
  await expect(dialog.getByLabel(/^Price per hour/)).toHaveCount(0);
  await expect(
    dialog.getByRole("region", { name: "Weekly rental schedule" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    { name: "Shared Hall", capacity: 20, isActive: true, allowRental: false },
  ]);
});

test("rental toggle reveals price and editable weekly hours in the same form", async ({
  page,
}) => {
  const { writes, dialog } = await setup(page);
  await dialog.getByRole("switch").check();
  await expect(
    dialog.getByRole("region", { name: "Weekly rental schedule" }),
  ).toBeVisible();
  await dialog.getByLabel(/^Price per hour/).fill("120000");
  await dialog.getByLabel("Monday Opens", { exact: true }).fill("08:00");
  await dialog.getByLabel("Monday Closes", { exact: true }).fill("20:00");
  await dialog.getByRole("checkbox", { name: "Sunday", exact: true }).uncheck();
  await expect(
    dialog.getByLabel("Sunday Opens", { exact: true }),
  ).toBeDisabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/create-room-rental-${width}.png`,
      fullPage: true,
    });
    await dialog
      .locator(".dialog__body")
      .evaluate((element) => element.scrollTo({ top: 0 }));
    await page.screenshot({
      path: `test-results/create-room-rental-${width}-top.png`,
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    isActive: true,
    allowRental: true,
    rentalSetup: { pricePerHour: 120000 },
  });
  const setupBody = writes[0].rentalSetup as {
    hours: Array<{
      dayOfWeek: number;
      openTimeLocal: string;
      closeTimeLocal: string;
    }>;
  };
  expect(setupBody.hours).toHaveLength(6);
  expect(setupBody.hours).toContainEqual({
    dayOfWeek: 1,
    openTimeLocal: "08:00",
    closeTimeLocal: "20:00",
  });
  expect(writes[0]).not.toHaveProperty("sportId");
});

test("turning rental off omits cached invalid rental values", async ({
  page,
}) => {
  const { writes, dialog } = await setup(page);
  await dialog.getByRole("switch").check();
  await dialog.getByLabel(/^Price per hour/).fill("0");
  await expect(dialog.getByRole("alert")).toContainText("2,000 VND");
  await dialog.getByRole("switch").uncheck();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toEqual({
    name: "Shared Hall",
    capacity: 20,
    isActive: true,
    allowRental: false,
  });
});

test("rental schedule requires a selected day and valid opening range", async ({
  page,
}) => {
  const { dialog } = await setup(page);
  await dialog.getByRole("switch").check();
  await expect(dialog.getByRole("checkbox")).toHaveCount(7);
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.uncheck();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Select at least one rental day.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Monday", exact: true }).check();
  await dialog.getByLabel("Monday Opens", { exact: true }).fill("20:00");
  await dialog.getByLabel("Monday Closes", { exact: true }).fill("08:00");
  await expect(dialog.getByRole("alert")).toContainText("at least one hour");
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Monday Closes", { exact: true }).fill("22:00");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
});

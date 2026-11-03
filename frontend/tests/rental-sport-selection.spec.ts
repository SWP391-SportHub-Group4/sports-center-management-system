import { expect, test } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

test("editing a room rental price unlocks Sport and preserves the room and price window", async ({
  page,
}, testInfo) => {
  await managerLayoutFixture(page);
  const room = {
    roomId: 15,
    name: "Court 15",
    capacity: 12,
    roomTypeId: 3,
    isActive: true,
    allowRental: true,
    activeClassCount: 0,
  };
  const sports = [
    {
      sportId: 3,
      code: "badminton",
      name: "Badminton",
      isActive: true,
      services: [],
    },
    {
      sportId: 4,
      code: "basketball",
      name: "Basketball",
      isActive: true,
      services: [],
    },
  ];
  let rate = {
    rateId: 91,
    roomId: 15,
    roomTypeId: 3,
    sportId: null as number | null,
    daysOfWeek: "MON,TUE,WED,THU,FRI,SAT,SUN",
    startTimeLocal: "06:00",
    endTimeLocal: "22:00",
    pricePerHour: 100000,
    isActive: true,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/rooms") return route.fulfill({ json: [room] });
    if (path === "/api/manager/sports") return route.fulfill({ json: sports });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [
          {
            roomTypeId: 3,
            name: "Shared rooms",
            sportIds: [3],
            isActive: true,
          },
        ],
      });
    if (path === "/api/manager/court-rates")
      return route.fulfill({ json: [rate] });
    if (path === "/api/manager/court-rates/91") {
      const body = request.postDataJSON();
      writes.push(body);
      rate = { ...rate, ...body, daysOfWeek: body.daysOfWeek.join(",") };
      return route.fulfill({ json: rate });
    }
    if (path === "/api/rooms/15/opening-hours")
      return route.fulfill({
        json: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          roomId: 15,
          dayOfWeek,
          openTimeLocal: "06:00",
          closeTimeLocal: "22:00",
        })),
      });
    if (path === "/api/system-settings")
      return route.fulfill({
        json: [
          { key: "center.opening_minutes", value: "360" },
          { key: "center.closing_minutes", value: "1320" },
        ],
      });
    return route.fallback();
  });
  await page.goto("/manager/facilities/15");
  await page
    .getByRole("region", { name: "Rental pricing", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit rental price",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Sport", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Sport", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await expect(
    dialog.getByRole("option", { name: "All compatible sports", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Sport", { exact: true })).toHaveValue("");
  await dialog
    .getByRole("checkbox", { name: "Wednesday", exact: true })
    .uncheck();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  const errorDialog = page.getByRole("dialog", {
    name: "Could not save rental price",
    exact: true,
  });
  await expect(errorDialog.getByRole("alert")).toHaveText("Select a sport.");
  await errorDialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(writes).toHaveLength(0);
  await dialog.getByLabel("Sport", { exact: true }).selectOption("4");
  await expect(dialog.getByLabel("Applies to", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(
    "06:00",
  );
  await expect(dialog.getByLabel("End", { exact: true })).toHaveValue("22:00");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: testInfo.outputPath(`rental-sport-${width}.png`),
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    sportId: 4,
    roomId: 15,
    roomTypeId: 3,
    startTimeLocal: "06:00",
    endTimeLocal: "22:00",
    pricePerHour: 100000,
  });
  await expect(
    page.getByRole("table").filter({ hasText: "Basketball" }),
  ).toBeVisible();

  for (const field of ["day", "start", "price", "sport", "status"]) {
    await page
      .getByRole("region", { name: "Rental pricing", exact: true })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    if (field === "day")
      await dialog
        .getByRole("checkbox", { name: "Monday", exact: true })
        .uncheck();
    if (field === "start")
      await dialog.getByLabel("Start", { exact: true }).fill("07:00");
    if (field === "price")
      await dialog.getByLabel("Price per hour (VND)", { exact: true }).fill("");
    if (field === "sport")
      await dialog.getByLabel("Sport", { exact: true }).selectOption("3");
    if (field === "status") await dialog.getByRole("switch").uncheck();
    await expect(save).toBeEnabled();
    if (field === "price") {
      await save.click();
      await expect(dialog).toBeVisible();
      await expect(errorDialog.getByRole("alert")).toContainText("2,000 VND");
      await errorDialog
        .getByRole("button", { name: "Close", exact: true })
        .click();
      expect(writes).toHaveLength(1);
      await expect(save).toBeEnabled();
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }

  await page
    .getByRole("button", { name: "Create court rate", exact: true })
    .click();
  const add = page.getByRole("dialog", {
    name: "Add rental price",
    exact: true,
  });
  await expect(
    add.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await add.getByRole("checkbox", { name: "Tuesday", exact: true }).check();
  await expect(
    add.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  await add.getByLabel("Sport", { exact: true }).selectOption("3");
  await add.getByRole("button", { name: "Save", exact: true }).click();
  await expect(errorDialog.getByRole("alert")).toContainText("2,000 VND");
  await errorDialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(writes).toHaveLength(1);
  await add.getByLabel("Price per hour (VND)", { exact: true }).fill("120000");
  let failSave = true;
  await page.route("**/api/manager/court-rates", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (failSave)
      return route.fulfill({
        status: 409,
        json: {
          error: "court_rate_overlap",
          message: "Rental price windows overlap.",
        },
      });
    return route.fulfill({ json: { ...rate, rateId: 92 } });
  });
  await add.getByRole("button", { name: "Save", exact: true }).click();
  await expect(errorDialog.getByRole("alert")).toHaveText(
    "Rental price windows overlap.",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await errorDialog.screenshot({
      path: testInfo.outputPath(`rental-error-${width}.png`),
    });
  }
  await page.keyboard.press("Escape");
  await expect(errorDialog).toHaveCount(0);
  await expect(add).toBeVisible();
  await expect(
    add.getByLabel("Price per hour (VND)", { exact: true }),
  ).toHaveValue("120000");
  failSave = false;
  await add.getByRole("button", { name: "Save", exact: true }).click();
  await expect(add).toHaveCount(0);
});

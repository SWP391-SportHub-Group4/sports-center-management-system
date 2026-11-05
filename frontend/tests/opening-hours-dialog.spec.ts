import { expect, test, type Page } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
async function setup(page: Page) {
  await managerLayoutFixture(page);
  let hours = [0, 2, 1, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    openTimeLocal: "08:00",
    closeTimeLocal: "20:00",
  }));
  const writes: Array<{ hours: typeof hours }> = [];
  let reject = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/rooms")
      return route.fulfill({
        json: [
          {
            roomId: 15,
            name: "Court 15",
            capacity: 12,
            roomTypeId: 3,
            isActive: true,
            allowRental: false,
          },
        ],
      });
    if (path === "/api/rooms/15/opening-hours")
      return route.fulfill({ json: hours });
    if (path === "/api/manager/rooms/15/opening-hours") {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (reject) {
        reject = false;
        return route.fulfill({
          status: 500,
          json: {
            error: "save_failed",
            message: "Unable to save opening hours. Try again.",
          },
        });
      }
      hours = body.hours;
      return route.fulfill({ json: hours });
    }
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
  return {
    writes,
    rejectNext: () => {
      reject = true;
    },
  };
}

for (const width of [1440, 390]) {
  test(`opening hours are read only and Cancel discards the Monday-first draft at ${width}px`, async ({
    page,
  }, testInfo) => {
    const { writes } = await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    const section = page.locator("#opening-hours");
    await expect(section.locator("dt")).toHaveText(weekdays);
    await expect(section.locator("input")).toHaveCount(0);
    await expect(section.locator("dd").nth(2)).toHaveText("Closed");
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`hours-summary-${width}.png`),
      fullPage: true,
    });
    await section.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Edit opening hours",
      exact: true,
    });
    await expect(dialog.locator('[role="group"]')).toHaveCount(7);
    for (const [index, name] of weekdays.entries())
      await expect(dialog.locator('[role="group"]').nth(index)).toHaveAttribute(
        "aria-label",
        name,
      );
    const monday = dialog.getByRole("group", { name: "Monday", exact: true });
    await monday.getByLabel("Opening time", { exact: true }).fill("10:00");
    await page.screenshot({
      path: testInfo.outputPath(`hours-dialog-${width}.png`),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await expect(section.locator("dd").first()).toHaveText("08:00–20:00");
    await section.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      monday.getByLabel("Opening time", { exact: true }),
    ).toHaveValue("08:00");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });
}

test("Save validates hours, retains failed edits, then refreshes the read-only schedule", async ({
  page,
}) => {
  const fixture = await setup(page);
  const section = page.locator("#opening-hours");
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit opening hours",
    exact: true,
  });
  const monday = dialog.getByRole("group", { name: "Monday", exact: true });
  await monday.getByLabel("Opening time", { exact: true }).fill("21:00");
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await monday.getByLabel("Opening time", { exact: true }).fill("10:00");
  await dialog
    .getByRole("group", { name: "Sunday", exact: true })
    .getByRole("checkbox")
    .uncheck();
  await dialog
    .getByRole("group", { name: "Wednesday", exact: true })
    .getByRole("checkbox")
    .check();
  fixture.rejectNext();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Unable to save");
  await expect(monday.getByLabel("Opening time", { exact: true })).toHaveValue(
    "10:00",
  );
  await expect(section.locator("dd").first()).toHaveText("08:00–20:00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(section.locator("dd").first()).toHaveText("10:00–20:00");
  await expect(section.locator("dd").nth(2)).toHaveText("06:00–22:00");
  await expect(section.locator("dd").last()).toHaveText("Closed");
  expect(fixture.writes.at(-1)!.hours.map((hour) => hour.dayOfWeek)).toEqual([
    1, 2, 3, 4, 5, 6,
  ]);
  await expect(section.locator("input")).toHaveCount(0);
});

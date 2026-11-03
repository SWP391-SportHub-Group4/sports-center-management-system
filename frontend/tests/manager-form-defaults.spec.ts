import { expect, test, type Page } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

async function setup(page: Page) {
  await managerLayoutFixture(page);
  await page.route("**/api/rooms", (route) =>
    route.fulfill({
      json: [
        {
          roomId: 1,
          name: "Court A",
          capacity: 12,
          roomTypeId: 3,
          sportId: 3,
          isActive: true,
          allowRental: true,
        },
      ],
    }),
  );
  await page.route("**/api/system-settings", (route) =>
    route.fulfill({
      json: [
        { key: "center.opening_minutes", value: "420" },
        { key: "center.closing_minutes", value: "1260" },
      ],
    }),
  );
}

test("new packages require a price while editing retains the saved price", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/membership-plans");
  await page
    .getByRole("button", { name: "Create Gym package", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/^Price/)).toHaveValue("");
  await expect(dialog.getByLabel(/^Price/)).toHaveAttribute("required", "");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(dialog.getByLabel(/^Price/)).toHaveValue("1500000");
});

test("room rates use the common window of selected days and block closed days", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/rooms/1/opening-hours", (route) =>
    route.fulfill({
      json: [
        { dayOfWeek: 1, openTimeLocal: "08:00", closeTimeLocal: "20:00" },
        { dayOfWeek: 2, openTimeLocal: "09:00", closeTimeLocal: "18:00" },
      ],
    }),
  );
  await page.goto("/manager/court-rates");
  await page
    .getByRole("button", { name: "Create court rate", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sport", { exact: false }).selectOption("3");
  await dialog.getByLabel("Applies to", { exact: true }).selectOption("1");
  await expect(dialog.getByLabel("Start", { exact: false })).toHaveAttribute(
    "min",
    "08:00",
  );
  await expect(dialog.getByLabel("End", { exact: false })).toHaveAttribute(
    "max",
    "20:00",
  );
  await expect(dialog.getByLabel("Start", { exact: false })).toHaveValue(
    "08:00",
  );
  await expect(dialog.getByLabel("End", { exact: false })).toHaveValue("20:00");
  await expect(dialog.getByLabel(/^Price per hour/)).toHaveValue("");
  await dialog.getByLabel(/^Price per hour/).fill("120000");
  await dialog.getByLabel("Start", { exact: false }).fill("08:00");
  await dialog.getByLabel("End", { exact: false }).fill("20:00");
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  await dialog.getByRole("checkbox", { name: "Tuesday", exact: true }).check();
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Start", { exact: false }).fill("09:00");
  await dialog.getByLabel("End", { exact: false }).fill("18:00");
  await expect(save).toBeEnabled();
  await dialog
    .getByRole("checkbox", { name: "Wednesday", exact: true })
    .check();
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText(
    "Configure opening hours",
  );
});

test("creating a class requires explicit schedule, capacity, price and cost including zero", async ({
  page,
}) => {
  await setup(page);
  await page.clock.setFixedTime(new Date("2030-10-03T02:00:00Z"));
  await page.route("**/api/manager/classes?**", (route) =>
    route.fulfill({
      json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
    }),
  );
  await page.route("**/api/coaches?**", (route) =>
    route.fulfill({ json: [{ userId: "coach-1", fullName: "Coach Linh" }] }),
  );
  await page.route("**/api/manager/class-schedule/availability?**", (route) =>
    route.fulfill({
      json: {
        available: true,
        reasons: [],
        roomName: "Court A",
        coachName: "Coach Linh",
      },
    }),
  );
  await page.goto("/manager/classes/new");
  await page.getByLabel(/^Code/).fill("NEW-CLASS");
  await page.getByLabel(/^Name/).fill("New class");
  await page
    .getByRole("combobox", { name: "Sport", exact: true })
    .selectOption("3");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByLabel(/^Capacity/)).toHaveValue("");
  await expect(page.getByLabel(/^Number of sessions/)).toHaveValue("");
  await expect(page.locator('input[type="time"]').first()).toHaveValue("");
  await page.getByLabel(/^Coach/).selectOption("coach-1");
  await page.getByRole("combobox", { name: /^Room/ }).selectOption("1");
  await page.getByLabel(/^Capacity/).fill("10");
  await page.getByLabel(/^Number of sessions/).fill("2");
  await page.locator('input[type="time"]').first().fill("10:00");
  await expect(next).toBeEnabled();
  await next.click();
  const price = page.getByLabel(/^Tuition per student/);
  const cost = page.getByLabel(/^Total class cost/);
  await expect(price).toHaveValue("");
  await expect(cost).toHaveValue("");
  await price.fill("200000");
  await expect(next).toBeDisabled();
  await cost.fill("0");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
});

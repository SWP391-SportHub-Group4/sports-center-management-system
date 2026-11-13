import { expect, test } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";
test("room editor closes without saving and can be reopened", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  let writes = 0;
  await page.route("**/api/rooms/1", async (route) => {
    writes += 1;
    await route.fulfill({ status: 500, json: {} });
  });
  await page.goto("/manager/facilities/1");
  const editor = page.getByRole("dialog", { name: "Edit room", exact: true });
  const editButton = page.getByRole("button", {
    name: "Edit room",
    exact: true,
  });
  for (const action of ["Cancel", "Close", "Escape"]) {
    await editButton.click();
    await expect(editor).toBeVisible();
    await expect(editor.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Indoor Badminton Court A",
    );
    await editor.getByRole("textbox", { name: "Name" }).fill("Unsaved change");
    if (action === "Escape") await page.keyboard.press("Escape");
    else
      await editor.getByRole("button", { name: action, exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Indoor Badminton Court A",
        exact: true,
      }),
    ).toBeVisible();
  }
  expect(writes).toBe(0);
});

test("room deletion is confirmed inside Edit room and returns to the room list", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  let deletes = 0;
  await page.route("**/api/rooms/1", async (route) => {
    if (route.request().method() === "DELETE") deletes++;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/manager/facilities/1");
  await page.getByRole("button", { name: "Edit room", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Edit room", exact: true })
    .getByRole("button", { name: "Delete room", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Delete room",
    exact: true,
  });
  expect(deletes).toBe(0);
  await confirmation
    .getByRole("button", { name: "Delete room", exact: true })
    .click();
  await expect(page).toHaveURL(/\/manager\/facilities$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deletes).toBe(1);
});

test("room incident navigation prefills the room after reloading its details", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  await page.goto("/manager/facilities/1");
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Images", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete room", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Incidents", exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/incidents\?roomId=1/);
  await expect(
    page.getByRole("combobox", { name: "Room", exact: true }),
  ).toHaveValue("Indoor Badminton Court A");
});

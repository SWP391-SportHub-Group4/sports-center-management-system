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

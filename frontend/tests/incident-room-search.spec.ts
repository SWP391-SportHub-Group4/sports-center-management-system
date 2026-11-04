import { expect, test } from "@playwright/test";

test("incident room search supports accents, keyboard selection and clearing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "room-search-fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
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
    if (path === "/api/rooms")
      return route.fulfill({
        json: [
          {
            roomId: 7,
            name: "Cầu Lông - NK",
            roomTypeId: 3,
            capacity: 12,
            isActive: true,
          },
          {
            roomId: 8,
            name: "Yoga Studio",
            roomTypeId: 4,
            capacity: 20,
            isActive: true,
          },
          {
            roomId: 9,
            name: "Cầu Lông đóng cửa",
            roomTypeId: 3,
            capacity: 12,
            isActive: false,
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/incidents");
  const room = page.getByRole("combobox", { name: "Room", exact: true });
  await room.fill("cau long");
  await expect(
    page.getByRole("option", { name: "Cầu Lông - NK", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: "Yoga Studio" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("option", { name: "Cầu Lông đóng cửa" }),
  ).toHaveCount(0);
  await room.press("Enter");
  await expect(room).toHaveValue("Cầu Lông - NK");
  await expect(page.getByRole("listbox", { name: "Room" })).toHaveCount(0);
  await room.fill("missing room");
  await expect(
    page.getByRole("status").filter({ hasText: "No data available" }),
  ).toBeVisible();
  await room.press("Escape");
  await expect(room).toHaveValue("Cầu Lông - NK");
  await room.fill("yoga");
  await page.getByRole("option", { name: "Yoga Studio" }).click();
  await expect(room).toHaveValue("Yoga Studio");
  await room.click();
  await room.press("ArrowDown");
  await room.press("Enter");
  await expect(room).toHaveValue("");
});

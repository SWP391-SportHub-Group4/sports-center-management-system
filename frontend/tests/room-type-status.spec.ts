import { test, expect } from "@playwright/test";
test("legacy room-type bookmark opens courts and rooms without room-type management", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "manager-fixture"),
  );
  await page.route("**/api/**", (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() !== "GET") writes.push(path);
    const json =
      path === "/api/users/me"
        ? {
            userId: "manager",
            fullName: "Manager",
            role: "CENTER_MANAGER",
            sportIds: [],
          }
        : [];
    return route.fulfill({ json });
  });
  await page.goto("/manager/room-types");
  await expect(page).toHaveURL(/\/manager\/facilities$/);
  await expect(
    page.getByRole("button", { name: "Create rental court", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Discontinue|Reactivate/ }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

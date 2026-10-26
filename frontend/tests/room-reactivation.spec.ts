import { expect, test } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

test("inactive rooms can configure rental access independently of availability", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  let room: Record<string, unknown> | undefined = {
    name: "Pickleball A",
    capacity: 12,
    isActive: false,
    roomId: 91,
    allowRental: false,
    activeClassCount: 0,
    roomTypeId: 51,
  };
  let failActivation = true;
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route("**/api/rooms**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      room = {
        ...body,
        roomId: 91,
        allowRental: false,
        activeClassCount: 0,
        roomTypeId: 51,
      };
      return route.fulfill({ status: 201, json: room });
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (!path.endsWith("/rental-access") && failActivation) {
        failActivation = false;
        return route.fulfill({
          status: 500,
          json: {
            error: "save_failed",
            message: "Unable to update room. Try again.",
          },
        });
      }
      room = { ...room, ...body };
      return route.fulfill({ json: room });
    }
    return route.fulfill({ json: room ? [room] : [] });
  });
  await page.goto("/manager/facilities");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Pickleball A" }) });
  const rental = row.getByRole("button", { name: "Allow rental", exact: true });
  const activate = row.getByRole("button", {
    name: "Activate Pickleball A",
    exact: true,
  });
  await expect(rental).toBeEnabled();
  await rental.click();
  await expect(row.getByText("Allowed", { exact: true })).toBeVisible();
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  await page.goto("/manager/facilities/91?tab=pricing");
  await page
    .getByRole("button", { name: "Disable rental", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Allow rental", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Allow rental", exact: true }).click();
  await page
    .getByRole("button", { name: "Disable rental", exact: true })
    .click();
  await page.goto("/manager/facilities");
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
  await activate.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to update room" }),
  ).toBeVisible();
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(rental).toBeEnabled();
  await activate.click();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await expect(rental).toBeEnabled();
  await rental.click();
  await expect(row.getByText("Allowed", { exact: true })).toBeVisible();
  await row
    .getByRole("button", { name: "Deactivate Pickleball A", exact: true })
    .click();
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(row.getByText("Allowed", { exact: true })).toBeVisible();
  expect(writes.filter((write) => write.path === "/api/rooms/91")[1]).toEqual({
    path: "/api/rooms/91",
    body: { name: "Pickleball A", capacity: 12, isActive: true },
  });
  expect(writes[0]).toEqual({
    path: "/api/rooms/91/rental-access",
    body: { allowRental: true },
  });
});

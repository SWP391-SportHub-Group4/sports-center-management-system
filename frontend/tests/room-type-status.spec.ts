import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function setup(page: Page) {
  const state = { active: true, fail: false };
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "manager",
        role: "CENTER_MANAGER",
        fullName: "Manager",
        email: "manager@example.com",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/room-types")
      return json([
        {
          roomTypeId: 51,
          name: "Badminton court",
          sportIds: [3],
          isActive: state.active,
        },
      ]);
    if (path === "/api/manager/sports")
      return json([
        { sportId: 3, name: "Badminton", services: [], isActive: true },
      ]);
    if (req.method() === "POST") {
      writes.push({ path, body: req.postDataJSON() });
      if (state.fail)
        return route.fulfill({
          status: 409,
          json: {
            error: "status_conflict",
            message: "Room type changed. Refresh and try again.",
          },
        });
      state.active = path.endsWith("reactivate");
      return json({ roomTypeId: 51, isActive: state.active });
    }
    return json([]);
  });
  return { state, writes };
}

test("manager discontinues and reactivates a whole type with a reason", async ({
  page,
}, info) => {
  const { writes } = await setup(page);
  await page.goto("/manager/room-types");
  await page.getByRole("button", { name: "Discontinue", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/Existing bookings and each room/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Discontinue", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: /reason/i })
    .fill("Stop new bookings for maintenance");
  await dialog
    .getByRole("button", { name: "Discontinue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: info.outputPath("room-types-mobile.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (x) => x.impact === "serious" || x.impact === "critical",
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: /reason/i })
    .fill("Allow new bookings again");
  await dialog.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Discontinue", exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    {
      path: "/api/manager/room-types/51/discontinue",
      body: { reason: "Stop new bookings for maintenance" },
    },
    {
      path: "/api/manager/room-types/51/reactivate",
      body: { reason: "Allow new bookings again" },
    },
  ]);
});

test("failed status change retains its reason and does not show success", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.fail = true;
  await page.goto("/manager/room-types");
  await page.getByRole("button", { name: "Discontinue", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /reason/i }).fill("Stop bookings");
  await dialog
    .getByRole("button", { name: "Discontinue", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Room type changed. Refresh and try again.",
  );
  await expect(dialog.getByRole("textbox", { name: /reason/i })).toHaveValue(
    "Stop bookings",
  );
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";
import { fillIncidentDateTime } from "./helpers/incident";

async function setup(page: Page, conflict = false) {
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "review-fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/users/me")
      return json({
        userId: "manager",
        role: "CENTER_MANAGER",
        fullName: "Manager",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/system-settings")
      return json([
        { key: "center.opening_minutes", value: "480" },
        { key: "center.closing_minutes", value: "1200" },
      ]);
    if (path === "/api/rooms")
      return json([
        {
          roomId: 7,
          roomTypeId: 3,
          name: "Court A",
          capacity: 12,
          isActive: true,
        },
      ]);
    if (path === "/api/room-types")
      return json([{ roomTypeId: 3, sportIds: [3], isActive: true }]);
    if (route.request().method() === "POST") writes.push(path);
    if (path === "/api/manager/incidents/preview") {
      if (conflict)
        return route.fulfill({
          status: 409,
          json: {
            error: "incident_overlap",
            message:
              "Another incident already covers this room and time. Choose a different room or time.",
          },
        });
      return json({
        ...route.request().postDataJSON(),
        impacts: [],
        members: [],
        refunds: [],
        previewToken: "token",
        canResolve: false,
        blockReason: "Schedule changes required",
      });
    }
    if (path === "/api/manager/incidents")
      return json({ items: [], page: 1, pageSize: 20, totalCount: 0 });
    return json([]);
  });
  await page.goto(
    "/manager/incidents?roomId=7&start=2030-10-04T08:00&end=2030-10-04T20:00&reason=Court%20floor%20repair",
  );
  return writes;
}

test("Review automatically protects the window without manual hold or incidents-in-progress controls", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByText("Incidents in progress", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/automatically blocked/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hold this window/ }),
  ).toHaveCount(0);
  expect(writes).toEqual(["/api/manager/incidents/preview"]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../.impeccable/review/incident-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/incident-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

for (const [start, end] of [
  ["2030-10-04T07:59", "2030-10-04T09:00"],
  ["2030-10-04T19:00", "2030-10-04T20:01"],
  ["2030-10-04T19:00", "2030-10-05T09:00"],
]) {
  test(`blocks incident outside operating hours: ${start} to ${end}`, async ({
    page,
  }) => {
    const writes = await setup(page);
    await fillIncidentDateTime(page, "Start", start);
    await fillIncidentDateTime(page, "End", end);
    await expect(
      page.getByRole("button", { name: "Review", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".field__error")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Check incident time" })
        .getByRole("alert")
        .filter({
          hasText: /opening time \(08:00\) and closing time \(20:00\)/,
        })
        .first(),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
  });
}

test("invalid time text shows a popup only after Review and dates show configured hours", async ({
  page,
}) => {
  const writes = await setup(page);
  await fillIncidentDateTime(page, "Start", "2030-10-04Ta");
  await fillIncidentDateTime(page, "End", "2030-10-04Ta");
  await expect(
    page.getByText("Allowed time: 08:00–20:00 (Vietnam time).", {
      exact: true,
    }),
  ).toHaveCount(2);
  await expect(page.locator(".field__error")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Check incident time" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("08:00");
  await expect(dialog.getByRole("alert")).toContainText("20:00");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review", exact: true }),
  ).toBeFocused();
  expect(writes).toHaveLength(0);
});

test("overlapping incident is rejected by the server and retains the form for correction", async ({
  page,
}) => {
  const writes = await setup(page, true);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Another incident already covers/ }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
    "Court floor repair",
  );
  expect(writes).toEqual(["/api/manager/incidents/preview"]);
});

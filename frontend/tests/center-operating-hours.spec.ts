import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const settings = [
    {
      key: "center.opening_minutes",
      value: "480",
      description: "Center opening time",
      updatedAt: "2026-10-25T00:00:00Z",
    },
    {
      key: "center.closing_minutes",
      value: "1200",
      description: "Center closing time",
      updatedAt: "2026-10-25T00:00:00Z",
    },
  ];
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "center-hours-manager");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/users/me")
      return json({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "CENTER_MANAGER",
        fullName: "Center Manager",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/system-settings") return json(settings);
    if (
      path.startsWith("/api/system-settings/") &&
      request.method() === "PUT"
    ) {
      const body = request.postDataJSON();
      writes.push({ path, body });
      const setting = settings.find((s) => s.key === path.split("/").at(-1))!;
      setting.value = body.value;
      return json(setting);
    }
    if (path === "/api/manager/sports" || path === "/api/sports")
      return json([
        {
          sportId: 3,
          code: "badminton",
          name: "Badminton",
          isActive: true,
          services: [
            {
              serviceType: "GROUP_COURSE",
              isEnabled: true,
              defaultSessionMinutes: 90,
              defaultMaxCapacity: 12,
            },
            {
              serviceType: "COURT_RENTAL",
              isEnabled: true,
              defaultSessionMinutes: null,
              defaultMaxCapacity: null,
            },
          ],
        },
      ]);
    if (path === "/api/rooms") return json([]);
    return json([]);
  });
  return writes;
}

test("settings display editable center times and validate their order", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/manager/settings");
  const opening = page
    .getByRole("row")
    .filter({ hasText: "Center opening time" });
  const closing = page
    .getByRole("row")
    .filter({ hasText: "Center closing time" });
  await expect(opening.getByLabel("Center opening time")).toHaveValue("08:00");
  await expect(closing.getByLabel("Center closing time")).toHaveValue("20:00");
  await closing.getByLabel("Center closing time").fill("07:00");
  await expect(
    closing.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await closing.getByLabel("Center closing time").fill("21:00");
  await closing.getByRole("button", { name: "Save", exact: true }).click();
  expect(writes).toContainEqual({
    path: "/api/system-settings/center.closing_minutes",
    body: { value: "1260" },
  });
});

test("new rental court uses configured hours and enforces native time bounds", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/facilities");
  await page
    .getByRole("button", { name: "Create rental court", exact: true })
    .click();
  // Time controls have no consistent implicit role across Chromium builds.
  const opens = page.locator('input[aria-label="Monday Opens"]');
  await expect(opens).toHaveValue("08:00");
  await expect(opens).toHaveAttribute("min", "08:00");
  await expect(opens).toHaveAttribute("max", "20:00");
  await opens.fill("07:00");
  expect(
    await opens.evaluate(
      (input: HTMLInputElement) => input.validity.rangeUnderflow,
    ),
  ).toBe(true);
  await expect(
    page.getByText("Center opening hours: 08:00–20:00 (Vietnam time).", {
      exact: true,
    }),
  ).toBeVisible();
});

test("class start bounds account for the entire session duration", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/classes/new");
  await page.getByLabel("Code", { exact: true }).fill("HOURS-DEMO");
  await page.getByLabel("Name", { exact: true }).fill("Center hours demo");
  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const start = page.locator('input[type="time"]').first();
  await expect(start).toHaveAttribute("min", "08:00");
  await expect(start).toHaveAttribute("max", "18:30");
  await start.fill("19:00");
  expect(
    await start.evaluate(
      (input: HTMLInputElement) => input.validity.rangeOverflow,
    ),
  ).toBe(true);
});

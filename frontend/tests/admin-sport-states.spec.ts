import { expect, test, type Page, type Route } from "@playwright/test";

const sports = [
  { sportId: 1, name: "Gym", isActive: true },
  { sportId: 2, name: "Badminton", isActive: true },
  { sportId: 3, name: "Archived sport", isActive: false },
];

async function setup(page: Page, response: (route: Route) => Promise<void>) {
  let showOptions = false;
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Admin fixture",
          email: "admin@example.com",
          role: "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (path === "/api/users/admin")
      return route.fulfill({
        json: {
          items: [
            {
              userId: "22222222-2222-4222-8222-222222222222",
              fullName: "Desk account",
              email: "desk@example.com",
              role: "RECEPTIONIST",
              status: "ACTIVE",
              sportIds: [],
            },
          ],
          page: 1,
          pageSize: 20,
          totalCount: 1,
        },
      });
    if (path === "/api/sports")
      return showOptions ? response(route) : route.fulfill({ json: sports });
    if (path.includes("notifications")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { code: "fixture_missing" } });
  });
  await page.goto("/admin/users");
  // Vai trò Coach không còn trong form tạo tài khoản nhân sự; chuyên môn chọn khi đổi vai trò một tài khoản.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Reason", { exact: true }).fill("Keep this reason");
  showOptions = true;
  await form.getByLabel("Role", { exact: true }).selectOption("COACH");
  return { form, group: form.getByRole("group", { name: "Specialties" }) };
}

test("sport loading shows checkbox-shaped skeletons and then selectable active sports", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { form, group } = await setup(page, async (route) => {
    await pending;
    await route.fulfill({ json: sports });
  });
  await expect(group.getByRole("status")).toHaveAttribute("aria-busy", "true");
  await expect(group.locator(".skeleton")).toHaveCount(3);
  await expect(group.getByRole("checkbox")).toHaveCount(0);
  const shape = await group
    .locator(".skeleton")
    .first()
    .evaluate((element) => getComputedStyle(element, "::before").flexBasis);
  expect(shape).toBe("18px");
  release();
  await expect(
    group.getByRole("checkbox", { name: "Gym", exact: true }),
  ).toBeVisible();
  await expect(group.getByRole("checkbox")).toHaveCount(2);
  await group.getByRole("checkbox", { name: "Gym", exact: true }).check();
  await expect(
    group.getByRole("checkbox", { name: "Gym", exact: true }),
  ).toBeChecked();
  await expect(form.getByLabel("Reason", { exact: true })).toHaveValue(
    "Keep this reason",
  );
});

for (const inactiveOnly of [false, true]) {
  test(`sport empty state covers ${inactiveOnly ? "inactive-only" : "empty"} API data and can reload`, async ({
    page,
  }) => {
    let recovered = false;
    const { group } = await setup(page, (route) =>
      route.fulfill({
        json: recovered
          ? sports
          : inactiveOnly
            ? sports.map((sport) => ({ ...sport, isActive: false }))
            : [],
      }),
    );
    await expect(
      group.getByRole("heading", { name: "No sports available to select" }),
    ).toBeVisible();
    await expect(group.getByRole("checkbox")).toHaveCount(0);
    recovered = true;
    await group.getByRole("button", { name: "Reload data" }).click();
    await expect(
      group.getByRole("checkbox", { name: "Gym", exact: true }),
    ).toBeVisible();
  });
}

for (const status of [500, 403, 409, 412]) {
  test(`sport HTTP ${status} has the correct recovery without losing form input`, async ({
    page,
  }) => {
    let recovered = false;
    const { form, group } = await setup(page, (route) =>
      recovered
        ? route.fulfill({ json: sports })
        : route.fulfill({
            status,
            json: {
              code: "SPORT_SAMPLE_ERROR",
              message: "PRIVATE_DETAIL_DO_NOT_SHOW",
            },
          }),
    );
    const title =
      status === 500
        ? "Unable to load specialties"
        : status === 403
          ? "You do not have access to this list"
          : "The sports list has changed";
    await expect(group.getByRole("heading", { name: title })).toBeVisible();
    await expect(group).not.toContainText("PRIVATE_DETAIL_DO_NOT_SHOW");
    await expect(group.getByRole("checkbox")).toHaveCount(0);
    if (status === 403) {
      await expect(
        group.getByRole("link", { name: "Go to home page" }),
      ).toHaveAttribute("href", "/");
      await expect(group.getByRole("button")).toHaveCount(0);
    } else {
      recovered = true;
      await group
        .getByRole("button", {
          name: status === 500 ? "Retry" : "Reload data",
          exact: true,
        })
        .click();
      await expect(
        group.getByRole("checkbox", { name: "Gym", exact: true }),
      ).toBeVisible();
    }
    await expect(form.getByLabel("Reason", { exact: true })).toHaveValue(
      "Keep this reason",
    );
  });
}

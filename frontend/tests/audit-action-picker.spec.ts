import { expect, test, type Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const accountActions = [
  "CHANGE_USER_ROLE",
  "CREATE_STAFF_ACCOUNT",
  "DEACTIVATE_USER_ACCOUNT",
];
const managerActions = [
  ...accountActions,
  "CREATE_CLASS",
  "CREATE_ROOM",
  "UPDATE_CLASS",
];

async function setup(
  page: Page,
  manager = false,
  mode: "normal" | "empty" | "retry" = "normal",
) {
  let actionRequests = 0;
  const queries: URL[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture-token"),
  );
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId,
          fullName: "Audit preview",
          email: "audit@example.invalid",
          role: manager ? "CENTER_MANAGER" : "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (url.pathname === "/api/audit-logs/actions") {
      actionRequests++;
      if (mode === "retry" && actionRequests === 1)
        return route.fulfill({
          status: 500,
          json: { error: "unavailable", message: "Unavailable" },
        });
      return route.fulfill({
        json: mode === "empty" ? [] : manager ? managerActions : accountActions,
      });
    }
    if (url.pathname === "/api/audit-logs") {
      queries.push(url);
      return route.fulfill({
        json: { items: [], page: 1, pageSize: 25, totalCount: 0 },
      });
    }
    return route.fulfill({ json: [] });
  });
  return queries;
}

test("Admin opens scoped actions, searches multiple words without case sensitivity and applies the exact choice", async ({
  page,
}) => {
  const queries = await setup(page);
  await page.goto("/admin/audit-log");
  const input = page.getByRole("combobox", { name: "Action", exact: true });
  await input.click();
  await expect(
    page.getByRole("option", { name: "Staff account created", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Class created", exact: true }),
  ).toHaveCount(0);
  await input.fill("  StAfF   CrEaTe  ");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page
    .getByRole("option", { name: "Staff account created", exact: true })
    .click();
  await expect(input).toHaveValue("Staff account created");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(queries.at(-1)?.searchParams.get("action")).toBeNull();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("action"))
    .toBe("CREATE_STAFF_ACCOUNT");
  expect(queries.at(-1)?.searchParams.get("targetEntity")).toBeNull();
  await input.click();
  await expect(
    page.getByRole("option", { name: "Account role changed", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "All actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("action"))
    .toBeNull();
});

test("Manager can select operational actions with the keyboard and dismiss suggestions", async ({
  page,
}) => {
  const queries = await setup(page, true);
  await page.goto("/manager/audit-log");
  const input = page.getByRole("combobox", { name: "Action", exact: true });
  await input.fill("create class");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("CREATE_CLASS");
  await expect(
    page.getByRole("button", { name: "Apply filters", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("action"))
    .toBe("CREATE_CLASS");
  await input.click();
  await input.press("Escape");
  await expect(input).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("Manager audit filters stay visible and apply automatically from later pages", async ({
  page,
}, testInfo) => {
  const queries = await setup(page, true);
  await page.goto("/manager/audit-log?page=6");
  for (const name of [
    "Apply filters",
    "Clear filters",
    "All time",
    "Today",
    "Last 7 days",
    "This month",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  const actor = page.getByLabel("Actor name or email", { exact: true });
  await expect(actor).toBeVisible();
  await actor.fill("Alex");
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("actor"))
    .toBe("Alex");
  await expect(actor).toBeFocused();
  await expect(page).not.toHaveURL(/page=6/);
  await actor.pressSequentially(" Nguyen");
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("actor"))
    .toBe("Alex Nguyen");
  await expect(page.getByLabel("Record type", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Event dates · Vietnam (UTC+7)", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("2026-11-04");
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("fromUtc"))
    .toBe("2026-11-03T17:00:00.000Z");
  await page.getByLabel("To date", { exact: true }).fill("2026-11-03");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The end date must be on or after the start date." }),
  ).toContainText("The end date must be on or after the start date.");
  await page.getByLabel("To date", { exact: true }).fill("2026-11-05");
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("toUtc"))
    .toBe("2026-11-05T17:00:00.000Z");
  await page.goBack();
  await expect(page.getByLabel("To date", { exact: true })).toHaveValue("");
  await expect(actor).toHaveValue("Alex Nguyen");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("audit-filters-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(actor).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("audit-filters-mobile.png"),
  });
});

test("Missing choices and load failures show useful states and retry succeeds", async ({
  page,
}) => {
  await setup(page, false, "retry");
  await page.goto("/admin/audit-log");
  const input = page.getByRole("combobox", { name: "Action", exact: true });
  await input.click();
  await expect(page.getByText("Unable to load actions.")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Staff account created", exact: true }),
  ).toBeVisible();
  await input.fill("not a real action");
  await expect(page.getByText("No actions match your search.")).toBeVisible();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Select an action from the list" }),
  ).toContainText("Select an action from the list");
});

test("Empty history and the mobile popup fit without horizontal overflow", async ({
  page,
}) => {
  await setup(page, false, "empty");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/admin/audit-log");
  await page.getByRole("combobox", { name: "Action", exact: true }).click();
  await expect(page.getByText("No actions recorded yet.")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "All actions", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

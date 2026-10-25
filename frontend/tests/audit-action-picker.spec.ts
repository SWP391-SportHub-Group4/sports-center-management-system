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
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("CREATE_CLASS");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("action"))
    .toBe("CREATE_CLASS");
  await input.click();
  await input.press("Escape");
  await expect(input).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
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

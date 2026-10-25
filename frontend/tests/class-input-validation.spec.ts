import { expect, test, type Page } from "@playwright/test";
import { managerLayoutFixture } from "./helpers/manager-layout";

async function setup(page: Page) {
  await managerLayoutFixture(page);
  const checks: string[] = [];
  await page.route("**/api/manager/classes?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const code = query.get("keyword") ?? "";
    checks.push(code);
    if (code === "FAIL")
      return route.fulfill({
        status: 500,
        json: { error: "test_error", message: "Unavailable" },
      });
    if (code === "SLOW")
      await new Promise((resolve) => setTimeout(resolve, 800));
    const items =
      code === "MMA131" || code === "SLOW" ? [{ classId: 99, code }] : [];
    await route.fulfill({
      json: { items, totalCount: items.length, page: 1, pageSize: 100 },
    });
  });
  await page.goto("/manager/classes/new");
  await expect(
    page.getByRole("heading", { name: "Create class", exact: true }),
  ).toBeVisible();
  return checks;
}

test("class code and name show errors below the inputs and recover while typing", async ({
  page,
}) => {
  const checks = await setup(page);
  const code = page.getByRole("textbox", { name: "Code", exact: false });
  const field = code.locator("..");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await code.fill("A");
  await expect(field.getByRole("alert")).toHaveText(
    "Enter a class code with 2-50 characters.",
  );
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await code.fill(" mma131 ");
  await expect(field.getByRole("alert")).toHaveText(
    "This class code is already in use. Enter a different code.",
  );
  await expect(next).toBeDisabled();
  expect(checks).toContain("MMA131");
  await code.fill("NEW-CODE");
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(next).toBeEnabled();
  await code.fill("");
  await expect(field.getByRole("alert")).toHaveText(
    "Enter a class code with 2-50 characters.",
  );
  const name = page.getByRole("textbox", { name: "Name", exact: false });
  await name.fill("   ");
  await expect(name.locator("..").getByRole("alert")).toHaveText(
    "Enter a class name with 1-150 characters.",
  );
  await name.fill("Volleyball for beginners");
  await expect(name.locator("..").getByRole("alert")).toHaveCount(0);
});

test("code checks can retry and ignore outdated responses", async ({
  page,
}) => {
  await setup(page);
  const code = page.getByRole("textbox", { name: "Code", exact: false });
  const field = code.locator("..");
  await code.fill("FAIL");
  await expect(field.getByRole("alert")).toHaveText(
    "Unable to check this code. Try again.",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(field.getByRole("status")).toHaveText("Checking class code…");
  await expect(field.getByRole("alert")).toHaveText(
    "Unable to check this code. Try again.",
  );
  const slow = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("keyword") === "SLOW",
  );
  await code.fill("SLOW");
  await slow;
  await code.fill("FREE-CODE");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(850);
  await expect(field.getByRole("alert")).toHaveCount(0);
});

test("code uniqueness checks every search page and excludes the class being edited", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/manager/classes?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const code = query.get("keyword")!;
    const items =
      query.get("page") === "1"
        ? [{ classId: 20, code: `OTHER-${code}` }]
        : [{ classId: 99, code }];
    await route.fulfill({
      json: {
        items,
        totalCount: 2,
        page: Number(query.get("page")),
        pageSize: 1,
      },
    });
  });
  const code = page.getByRole("textbox", { name: "Code", exact: false });
  await code.fill("MMA131");
  await expect(code.locator("..").getByRole("alert")).toHaveText(
    "This class code is already in use. Enter a different code.",
  );
  await page.route("**/api/manager/classes/99", (route) =>
    route.fulfill({
      json: {
        classId: 99,
        code: "MMA131",
        name: "Existing class",
        status: "DRAFT",
        version: 1,
        sportId: 3,
        capacity: 12,
        sessionMinutes: 90,
        numSessions: 12,
        startDate: "2030-11-01",
        price: 300000,
        costAmount: 0,
      },
    }),
  );
  await page.goto("/manager/classes/99/edit");
  await expect(code).toHaveValue("MMA131");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled();
  await expect(code.locator("..").getByRole("alert")).toHaveCount(0);
});

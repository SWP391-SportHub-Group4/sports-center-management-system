import { expect, test, type Page } from "@playwright/test";

const actorId = "11111111-1111-4111-8111-111111111111";
const account = {
  userId: "22222222-2222-4222-8222-222222222222",
  fullName: "Coach example",
  email: "coach@example.com",
  role: "COACH",
  status: "ACTIVE",
  sportIds: [1],
};
const audit = {
  auditId: "33333333-3333-4333-8333-333333333333",
  userId: actorId,
  actorEmail: "admin@example.com",
  action: "LOCK_USER",
  targetEntity: "UserAccount",
  targetId: account.userId,
  timestamp: "2030-10-03T02:00:00Z",
  oldValue: null,
  newValue: null,
};

async function setup(page: Page) {
  const requests: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId: actorId,
          fullName: "Admin fixture",
          email: "admin@example.com",
          role: "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (url.pathname.includes("notifications"))
      return route.fulfill({ json: [] });
    if (
      url.pathname === "/api/users/admin" ||
      url.pathname === "/api/audit-logs"
    ) {
      requests.push(url);
      return route.fulfill({
        json: {
          items: [url.pathname.includes("audit") ? audit : account],
          page: Number(url.searchParams.get("page")),
          pageSize: url.pathname.includes("audit") ? 25 : 20,
          totalCount: 51,
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: url.pathname },
    });
  });
  return requests;
}

test("Users FilterBar restores shared URL, reload and browser history; reset preserves unrelated query and sorting", async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto(
    "/admin/users?keyword=Coach&role=COACH&status=ACTIVE&page=2&sortBy=fullName&sortDirection=desc&keep=1",
  );
  await expect(page.getByLabel("Search name or email")).toHaveValue("Coach");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("COACH");
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue(
    "ACTIVE",
  );
  await expect(
    page.getByRole("button", { name: /Clear filters.*3/ }),
  ).toBeVisible();
  await expect.poll(() => requests.at(-1)?.searchParams.get("page")).toBe("2");
  await page.reload();
  await expect(page.getByLabel("Search name or email")).toHaveValue("Coach");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("COACH");
  await page.getByLabel("Role", { exact: true }).selectOption("RECEPTIONIST");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("role"))
    .toBe("RECEPTIONIST");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  let url = new URL(page.url());
  expect(url.searchParams.get("keep")).toBe("1");
  expect(url.searchParams.get("sortDirection")).toBe("desc");
  await page.goBack();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("COACH");
  await expect.poll(() => requests.at(-1)?.searchParams.get("page")).toBe("2");
  await page.goForward();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue(
    "RECEPTIONIST",
  );
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByLabel("Search name or email")).toHaveValue("");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue(
    "",
  );
  url = new URL(page.url());
  for (const key of ["keyword", "role", "status", "page"])
    expect(url.searchParams.has(key)).toBeFalsy();
  expect(url.searchParams.get("keep")).toBe("1");
  expect(url.searchParams.get("sortBy")).toBe("fullName");
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toBeVisible();
});

test("Users search and status selection reach the API and reset pagination", async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto("/admin/users?page=2");
  await expect.poll(() => requests.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByLabel("Search name or email").fill("Coach example");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("keyword"))
    .toBe("Coach example");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  expect(new URL(page.url()).searchParams.get("keyword")).toBe("Coach example");
  await page
    .getByLabel("Account status", { exact: true })
    .selectOption("BANNED");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("status"))
    .toBe("BANNED");
  await expect(
    page.getByRole("button", { name: /Clear filters.*2/ }),
  ).toBeVisible();
});

test("invalid list sort/page/select URL values use safe defaults", async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto(
    "/admin/users?page=-2&role=UNKNOWN&status=UNKNOWN&sortBy=unsupported&sortDirection=sideways",
  );
  await expect(page.getByText("Coach example", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue(
    "",
  );
  const params = requests.at(-1)!.searchParams;
  expect(params.get("page")).toBe("1");
  expect(params.get("sortBy")).toBe("email");
  expect(params.get("sortDirection")).toBe("asc");
  expect(params.has("role")).toBeFalsy();
  expect(params.has("status")).toBeFalsy();
});

test("Audit FilterBar applies drafts only on submit, validates actor, and preserves account scope", async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto(
    `/admin/audit-log?action=LOCK_USER&actorId=${actorId}&page=2&sortBy=action&keep=1&targetEntity=PointWallet`,
  );
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue(
    "LOCK_USER",
  );
  await expect(page.getByLabel("Actor ID", { exact: true })).toHaveValue(
    actorId,
  );
  await expect.poll(() => requests.at(-1)?.searchParams.get("page")).toBe("2");
  expect(requests.at(-1)?.searchParams.get("targetEntity")).toBe("UserAccount");
  await expect(page.getByLabel("Entity", { exact: true })).toHaveCount(0);
  const count = requests.length;
  await page.getByLabel("Action", { exact: true }).fill("UNLOCK_USER");
  await page.getByLabel("Actor ID", { exact: true }).fill("incomplete");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a valid actor ID" })).toHaveText(
    "Enter a valid actor ID (UUID), or leave it empty.",
  );
  expect(requests.length).toBe(count);
  expect(new URL(page.url()).searchParams.get("action")).toBe("LOCK_USER");
  await page.getByLabel("Actor ID", { exact: true }).fill(actorId);
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("action"))
    .toBe("UNLOCK_USER");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  expect(new URL(page.url()).searchParams.get("keep")).toBe("1");
  await page.reload();
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue(
    "UNLOCK_USER",
  );
  await page.goBack();
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue(
    "LOCK_USER",
  );
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Actor ID", { exact: true })).toHaveValue("");
  const url = new URL(page.url());
  for (const key of ["action", "targetEntity", "actorId", "page"])
    expect(url.searchParams.has(key)).toBeFalsy();
  expect(url.searchParams.get("sortBy")).toBe("action");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("targetEntity"))
    .toBe("UserAccount");
});

test("FilterBar fits both Admin pages in Vietnamese and mobile", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("sporthub_lang", "vi"));
  for (const path of ["users", "audit-log"]) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/${path}`);
      await expect(page.getByRole("table")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Xóa bộ lọc/ }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `test-results/filterbar-${path}-${width}.png`,
        fullPage: true,
      });
    }
  }
});

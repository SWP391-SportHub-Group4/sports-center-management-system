import { expect, test, type Page } from "@playwright/test";

const adminId = "11111111-1111-4111-8111-111111111111";
const coach = {
  userId: "22222222-2222-4222-8222-222222222222",
  fullName: "Coach sample",
  email: "coach@example.com",
  role: "COACH",
  status: "ACTIVE",
  sportIds: [1],
};
const account = {
  ...coach,
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Second account",
  email: "second@example.com",
};
const audit = {
  auditId: "44444444-4444-4444-8444-444444444444",
  userId: adminId,
  actorEmail: "admin@example.com",
  action: "LOCK_USER",
  targetEntity: "UserAccount",
  targetId: coach.userId,
  timestamp: "2030-10-03T02:00:00Z",
  oldValue: '{"status":"ACTIVE","otp":"SECRET_OTP"}',
  newValue: '{"status":"BANNED","emailBody":"SECRET_BODY"}',
};

async function auth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: adminId,
          fullName: "Admin fixture",
          email: "admin@example.com",
          role: "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [{ sportId: 1, name: "Gym", isActive: true }],
      });
    if (path.includes("notifications")) return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
}

test("users delegates pagination and sorting to API, resets page, keeps Edit", async ({
  page,
}) => {
  await auth(page);
  let query = new URL("http://localhost");
  await page.route("**/api/users/admin?**", (route) => {
    query = new URL(route.request().url());
    const currentPage = Number(query.searchParams.get("page"));
    return route.fulfill({
      json: {
        items: currentPage === 2 ? [account] : [coach],
        page: currentPage,
        pageSize: 20,
        totalCount: 21,
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("table", { name: "Users and roles" }),
  ).toBeVisible();
  await expect(page.getByText("Coach sample", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Second account", { exact: true })).toBeVisible();
  expect(query.searchParams.get("page")).toBe("2");
  await page.getByRole("button", { name: /^Full name/ }).click();
  await expect.poll(() => query.searchParams.get("sortBy")).toBe("fullName");
  expect(query.searchParams.get("page")).toBe("1");
  expect(query.searchParams.get("sortDirection")).toBe("asc");
  await expect(
    page.getByRole("columnheader", { name: /^Full name/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: /^Full name/ }).click();
  await expect.poll(() => query.searchParams.get("sortDirection")).toBe("desc");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Reason", { exact: true })).toBeVisible();
  const option = page.locator("fieldset label").filter({ hasText: "Gym" });
  await expect(option.getByRole("checkbox")).toBeChecked();
  const bounds = await option.evaluate((el) => {
    const box = el.querySelector("input")!.getBoundingClientRect();
    const name = el.querySelector("span")!.getBoundingClientRect();
    return {
      boxCenter: (box.top + box.bottom) / 2,
      nameCenter: (name.top + name.bottom) / 2,
      boxRight: box.right,
      nameLeft: name.left,
    };
  });
  expect(Math.abs(bounds.boxCenter - bounds.nameCenter)).toBeLessThan(2);
  expect(bounds.boxRight).toBeLessThan(bounds.nameLeft);
});

test("empty users offers clear filters and reloads the list", async ({
  page,
}) => {
  await auth(page);
  await page.route("**/api/users/admin?**", (route) => {
    const filtered = new URL(route.request().url()).searchParams.get("keyword");
    return route.fulfill({
      json: {
        items: filtered ? [] : [coach],
        page: 1,
        pageSize: 20,
        totalCount: filtered ? 0 : 1,
      },
    });
  });
  await page.goto("/admin/users");
  await page.getByLabel("Search name or email").fill("missing-account");
  await expect(
    page.getByText("No data available", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Coach sample", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search name or email")).toHaveValue("");
});

for (const status of [500, 403, 409, 412]) {
  test(`users handles HTTP ${status} and a safe recovery action`, async ({
    page,
  }) => {
    await auth(page);
    let failed = true;
    await page.route("**/api/users/admin?**", (route) =>
      route.fulfill(
        failed
          ? {
              status,
              json: { code: "test_failure", message: "Fixture failure" },
            }
          : { json: { items: [coach], page: 1, pageSize: 20, totalCount: 1 } },
      ),
    );
    await page.goto("/admin/users");
    await expect(
      page.getByText(
        status === 403
          ? "You do not have access to this list"
          : status === 500
            ? "Unable to load the list"
            : "The data has changed",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("Coach sample", { exact: true })).toHaveCount(
      0,
    );
    if (status === 403) {
      await expect(
        page.getByRole("link", { name: "Go to home page" }),
      ).toHaveAttribute("href", "/");
    } else {
      failed = false;
      await page
        .getByRole("button", {
          name: status === 500 ? "Retry" : "Reload data",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Coach sample", { exact: true }),
      ).toBeVisible();
    }
  });
}

test("initial users load preserves table-shaped skeletons", async ({
  page,
}) => {
  await auth(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/users/admin?**", async (route) => {
    await gate;
    await route.fulfill({
      json: { items: [coach], page: 1, pageSize: 20, totalCount: 1 },
    });
  });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("region", { name: "Users and roles" }),
  ).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("table tbody .skeleton")).toHaveCount(15);
  release();
  await expect(page.getByText("Coach sample", { exact: true })).toBeVisible();
});

test("Audit log keeps scope, metadata redaction, filtering and server pagination/sort", async ({
  page,
}) => {
  await auth(page);
  let query = new URL("http://localhost");
  await page.route("**/api/audit-logs?**", (route) => {
    query = new URL(route.request().url());
    return route.fulfill({
      json: {
        items: [audit],
        page: Number(query.searchParams.get("page")),
        pageSize: 25,
        totalCount: 26,
      },
    });
  });
  await page.goto("/admin/audit-log");
  await expect(page.getByRole("table", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("status: BANNED", { exact: true })).toBeVisible();
  expect(query.searchParams.get("targetEntity")).toBe("UserAccount");
  await expect(page.getByText(/SECRET_OTP|SECRET_BODY/)).toHaveCount(0);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect.poll(() => query.searchParams.get("page")).toBe("2");
  await page.getByRole("button", { name: /^Time/ }).click();
  await expect.poll(() => query.searchParams.get("sortDirection")).toBe("asc");
  expect(query.searchParams.get("page")).toBe("1");
  await page.getByLabel("Actor ID", { exact: true }).fill(adminId);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect.poll(() => query.searchParams.get("actorId")).toBe(adminId);
});

test("both Admin tables fit desktop and mobile with working mobile sort", async ({
  page,
}) => {
  await auth(page);
  const queries: string[] = [];
  await page.route("**/api/users/admin?**", (route) => {
    queries.push(route.request().url());
    return route.fulfill({
      json: {
        items: [{ ...coach, email: "long-email-for-layout-check@example.com" }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      },
    });
  });
  await page.route("**/api/audit-logs?**", (route) =>
    route.fulfill({
      json: { items: [audit], page: 1, pageSize: 25, totalCount: 1 },
    }),
  );
  for (const path of ["users", "audit-log"]) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/${path}`);
      await expect(page.getByRole("table")).toBeVisible();
      await expect(
        page.getByText(path === "users" ? "Coach sample" : "LOCK_USER", {
          exact: true,
        }),
      ).toBeVisible();
      const overflow = await page.evaluate(() => ({
        width: window.innerWidth,
        actual: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("#main-content *")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > window.innerWidth + 1;
          })
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.getBoundingClientRect().width,
          }))
          .slice(0, 15),
      }));
      expect(
        overflow.actual,
        JSON.stringify({ path, ...overflow }),
      ).toBeLessThanOrEqual(width);
      if (width < 768) {
        await expect(page.getByLabel("Sort by", { exact: true })).toBeVisible();
        expect(
          await page
            .locator("table tbody tr")
            .first()
            .evaluate((el) => getComputedStyle(el).display),
        ).toBe("block");
      }
      await page.screenshot({
        path: `test-results/admin-${path}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto("/admin/users");
  await page.getByLabel("Sort by", { exact: true }).selectOption("fullName");
  await expect.poll(() => queries.at(-1)).toContain("sortBy=fullName");
});

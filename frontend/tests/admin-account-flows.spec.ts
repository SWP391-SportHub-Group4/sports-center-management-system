import { expect, test, type Page } from "@playwright/test";
import { installBrowserSession, loginApi } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

const adminId = "11111111-1111-4111-8111-111111111111";
const account = {
  userId: "22222222-2222-4222-8222-222222222222",
  fullName: "Nguyễn Văn An",
  email: "an@example.com",
  phone: "0901234567",
  role: "RECEPTIONIST",
  status: "ACTIVE",
  sportIds: [],
  createdAt: "2026-10-01T02:00:00Z",
  hasPassword: true,
  hasGoogleLink: false,
};

async function setup(
  page: Page,
  options: { self?: boolean; detailStatus?: number; role?: string } = {},
) {
  const row = options.self
    ? { ...account, userId: adminId, role: "SYSTEM_ADMINISTRATOR" }
    : { ...account };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          ...account,
          userId: adminId,
          role: options.role ?? "SYSTEM_ADMINISTRATOR",
        },
      });
    if (url.pathname === "/api/users/admin") {
      const totals: Record<string, number> = {
        ACTIVE: 137,
        BANNED: 8,
        DEACTIVATED: 4,
      };
      return route.fulfill({
        json: {
          items: [row],
          totalCount: totals[url.searchParams.get("status") ?? ""] ?? 1,
          page: 1,
          pageSize: Number(url.searchParams.get("pageSize") ?? 20),
        },
      });
    }
    if (url.pathname === `/api/users/${row.userId}`) {
      return options.detailStatus
        ? route.fulfill({
            status: options.detailStatus,
            json: { error: "forbidden", message: "Access denied" },
          })
        : route.fulfill({ json: row });
    }
    if (url.pathname === "/api/sports")
      return route.fulfill({
        json: [{ sportId: 1, name: "Gym", isActive: true }],
      });
    if (url.pathname === "/api/audit-logs")
      return route.fulfill({
        json: {
          items: [
            {
              auditId: "audit-1",
              userId: adminId,
              actorEmail: "admin@example.com",
              action: "CHANGE_USER_ROLE",
              targetId: row.userId,
              targetEntity: "UserAccount",
              targetFullName: row.fullName,
              targetEmail: row.email,
              targetAccountExists: true,
              timestamp: "2026-10-06T02:00:00Z",
              oldValue: null,
              newValue: null,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 5,
        },
      });
    if (url.pathname.includes("notifications"))
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: "fixture_missing", message: url.pathname },
    });
  });
  return row;
}

test("live Admin overview uses account APIs and detail exposes the current G10 policy", async ({
  page,
  request,
}) => {
  test.skip(!liveApiBase, "Requires Docker API and demo Admin account.");
  const { accessToken, user } = await loginApi(request, "admin@sporthub.vn");
  const headers = bearer(accessToken);
  const active = await request.get(
    `${liveApiBase}/api/users/admin?status=ACTIVE&pageSize=1`,
    { headers },
  );
  expect(active.ok()).toBeTruthy();
  const count = (await active.json()).totalCount;
  await installBrowserSession(page, accessToken);
  await page.goto("/admin");
  await expect(
    page.getByRole("link", { name: `Active ${count}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tổng quan Admin", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/admin-overview-live.png",
    fullPage: true,
  });
  await page.goto(`/admin/users/${user.userId}`);
  await expect(
    page.getByText("BLOCKED API — G10", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("BLOCKED API — G10", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/admin-detail-g10-live.png",
    fullPage: true,
  });
});

test("overview uses server totals and preserves status filters and create shortcut", async ({
  page,
}) => {
  await setup(page);
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/admin");
  await expect(
    page.getByRole("link", { name: "Active 137", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Locked 8", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent account activity" }),
  ).toContainText("Role changed");
  // Ảnh minh chứng: lỗi ghi tệp (bị khóa bởi trình xem ảnh) không làm hỏng phép kiểm tra.
  await page
    .screenshot({
      path: "../output/admin-overview-desktop.png",
      fullPage: true,
    })
    .catch(() => undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBeTruthy();
  await page.screenshot({
    path: "../output/admin-overview-mobile.png",
    fullPage: true,
  });
  expect(
    paths.some((path) => /finance|wallet|report|invoice/.test(path)),
  ).toBeFalsy();
  await page.getByRole("link", { name: "Locked 8", exact: true }).click();
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue(
    "BANNED",
  );
  await page.goto("/admin");
  await page
    .getByRole("link", { name: "Create staff account", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create staff account", exact: true }),
  ).toBeVisible();
});

test("overview shows API failure without inventing zero totals", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/users/admin?**", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "unavailable", message: "Unable to load account totals" },
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByText("Unable to load account totals", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Active \d/ })).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Recent account activity" }),
  ).toBeVisible();
});

test("Admin detail reports G10 on direct access and reload without hiding other errors", async ({
  page,
}) => {
  await setup(page, { detailStatus: 403 });
  await page.goto(`/admin/users/${account.userId}`);
  await expect(
    page.getByText("BLOCKED API — G10", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("BLOCKED API — G10", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/admin-detail-g10.png",
    fullPage: true,
  });
  await page.route(`**/api/users/${account.userId}`, (route) =>
    route.fulfill({
      status: 404,
      json: { error: "user_not_found", message: "Missing user" },
    }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Account not found", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("BLOCKED API — G10", { exact: true }),
  ).toHaveCount(0);
});

test("role change requires reason and review; backend denial preserves the form", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route(`**/api/users/${account.userId}/role`, (route) => {
    writes++;
    expect(route.request().postDataJSON()).toMatchObject({
      role: "SYSTEM_ADMINISTRATOR",
      reason: "Approved role change",
    });
    return route.fulfill({
      status: 409,
      json: {
        error: "last_active_system_administrator",
        message: "Cannot demote the last active Administrator",
      },
    });
  });
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Role", { exact: true })
    .selectOption("SYSTEM_ADMINISTRATOR");
  await expect(
    dialog.getByRole("button", { name: "Change role", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Approved role change");
  await dialog
    .getByRole("button", { name: "Change role", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Changing the role invalidates existing sessions",
  );
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toContainText(
    "Cannot demote the last active Administrator",
  );
  await dialog
    .getByRole("button", { name: "Edit change", exact: true })
    .click();
  await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue(
    "Approved role change",
  );
  await expect(dialog.getByLabel("Role", { exact: true })).toHaveValue(
    "SYSTEM_ADMINISTRATOR",
  );
});

test("lock/unlock require review, refresh the list and display successful outcomes", async ({
  page,
}) => {
  const row = await setup(page);
  let writes = 0;
  await page.route(`**/api/users/${account.userId}/*`, (route) => {
    writes++;
    row.status = route.request().url().endsWith("/lock") ? "BANNED" : "ACTIVE";
    return route.fulfill({ json: row });
  });
  await page.goto("/admin/users");
  for (const action of ["Lock", "Unlock"]) {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Reason", { exact: true })
      .fill("Approved account change");
    await dialog.getByRole("button", { name: action, exact: true }).click();
    const before = writes;
    await expect(dialog).toContainText("Approved account change");
    expect(writes).toBe(before);
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("table", { name: "Users and roles" }),
    ).toContainText(action === "Lock" ? "Locked" : "Active");
    await expect(
      page.getByText("Account updated. The list has been refreshed.", {
        exact: true,
      }),
    ).toBeVisible();
  }
  expect(writes).toBe(2);
});

test("staff creation requires review, keeps password private and submits only once", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/users", (route) => {
    writes++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({
      fullName: "New staff",
      role: "RECEPTIONIST",
      sportIds: [],
    });
    return route.fulfill({ status: 201, json: account });
  });
  await page.goto("/admin/users?create=1");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Role", { exact: true }).locator("option"),
  ).toHaveText(["Center Manager", "Receptionist", "System Administrator"]);
  await dialog.getByLabel("Full name", { exact: true }).fill("New staff");
  await dialog.getByLabel("Email", { exact: true }).fill("new@example.com");
  await dialog.getByLabel("Password", { exact: true }).fill("StrongPass@123");
  await dialog
    .getByLabel("Confirm password", { exact: true })
    .fill("StrongPass@123");
  await dialog
    .getByRole("button", { name: "Review staff account", exact: true })
    .click();
  await expect(dialog).toContainText("new@example.com");
  await expect(dialog).not.toContainText("StrongPass@123");
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Staff account created. The list has been refreshed.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

test("own account cannot be locked; Escape restores focus to Edit", async ({
  page,
}) => {
  await setup(page, { self: true });
  await page.goto("/admin/users");
  const trigger = page.getByRole("button", { name: "Edit", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  for (const action of ["Lock", "Unlock", "Deactivate"])
    await expect(
      dialog.getByRole("button", { name: action, exact: true }),
    ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("non-Admin cannot mount account detail or make its API request", async ({
  page,
}) => {
  await setup(page, { role: "MEMBER" });
  let detailsRequested = false;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === `/api/users/${account.userId}`)
      detailsRequested = true;
  });
  await page.goto(`/admin/users/${account.userId}`);
  await expect(page).toHaveURL(/\/member/);
  expect(detailsRequested).toBeFalsy();
});

test("detail reloads current data after mutation when the API allows access", async ({
  page,
}) => {
  const row = await setup(page);
  await page.route(`**/api/users/${account.userId}/lock`, (route) => {
    row.status = "BANNED";
    return route.fulfill({ json: row });
  });
  await page.goto(`/admin/users/${account.userId}`);
  await expect(
    page.getByRole("heading", { name: "Identity and access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Approved access change");
  await dialog.getByRole("button", { name: "Lock", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("dl").first()).toContainText("Locked");
  await page.reload();
  await expect(page.locator("dl").first()).toContainText("Locked");
});

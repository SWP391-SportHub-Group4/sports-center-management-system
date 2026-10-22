import { expect, test, type Page } from "@playwright/test";
import { installBrowserSession, loginApi } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";
import { assertEnglishOnlyShell } from "./helpers/english";

const adminId = "11111111-1111-4111-8111-111111111111";
const account = {
  userId: "22222222-2222-4222-8222-222222222222",
  fullName: "Nguyễn Văn An",
  email: "an@example.com",
  phone: "0901234567",
  role: "RECEPTIONIST",
  status: "ACTIVE",
  sportIds: [] as number[],
  createdAt: "2026-10-01T02:00:00Z",
  hasPassword: true,
  hasGoogleLink: false,
  activationPending: false,
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
    if (url.pathname === `/api/users/admin/${row.userId}`) {
      return options.detailStatus
        ? route.fulfill({
            status: options.detailStatus,
            json: { error: "forbidden", message: "Access denied" },
          })
        : route.fulfill({ json: row });
    }
    if (url.pathname === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 3,
            name: "Badminton",
            isActive: true,
            services: [{ serviceType: "GROUP_COURSE", isEnabled: true }],
          },
        ],
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
  await assertEnglishOnlyShell(page);
  await expect(
    page.getByRole("heading", { name: "Admin overview", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../output/admin-overview-live.png",
    fullPage: true,
  });
  await page.goto(`/admin/users/${user.userId}`);
  await expect(
    page.getByRole("heading", { name: "Account details", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Account details", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/admin-detail-g10-live.png",
    fullPage: true,
  });
});

test("overview uses server totals and preserves status filters without the removed header and shortcuts", async ({
  page,
}) => {
  await setup(page);
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Admin overview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Account administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Active 137", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Locked 8", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent activity" }),
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
  await expect(
    page.getByRole("link", { name: "Create staff account", exact: true }),
  ).toHaveCount(0);
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
    page.getByRole("table", { name: "Recent activity" }),
  ).toBeVisible();
});

test("Admin detail displays access denial on reload and distinguishes a missing account", async ({
  page,
}) => {
  await setup(page, { detailStatus: 403 });
  await page.goto(`/admin/users/${account.userId}`);
  await expect(
    page.getByRole("heading", {
      name: "You cannot view this account",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "You cannot view this account",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "../output/admin-detail-g10.png",
    fullPage: true,
  });
  await page.route(`**/api/users/admin/${account.userId}`, (route) =>
    route.fulfill({
      status: 404,
      json: { error: "user_not_found", message: "Missing user" },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Account not found", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "You cannot view this account",
      exact: true,
    }),
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
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Role", { exact: true })
    .selectOption("SYSTEM_ADMINISTRATOR");
  await expect(
    dialog.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Approved role change");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Changing the role invalidates existing sessions",
  );
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
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

test("blocked Coach role change shows specific reasons and shareable handoff links", async ({
  page,
}) => {
  const row = await setup(page);
  row.role = "COACH";
  await page.route(`**/api/users/${row.userId}/role`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "role_change_blocked",
        message: "Role change is blocked.",
        reasons: [
          "Main coach of 1 unfinished class. Reassign it first.",
          "2 upcoming class session(s) are still assigned. Reassign or cancel them first.",
          "1 active coaching relationship(s). End or transfer them first.",
        ],
      },
    }),
  );
  await page.goto("/admin/users");
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Hire as receptionist");
  await dialog.getByLabel("Role", { exact: true }).selectOption("RECEPTIONIST");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();

  const blockers = dialog.getByRole("region", {
    name: "Resolve these items before changing the role",
  });
  await expect(blockers.getByRole("listitem")).toHaveCount(3);
  await expect(blockers).toContainText("Main coach of 1 unfinished class");
  await expect(blockers).toContainText("2 upcoming class session(s)");
  await expect(blockers).toContainText("1 active coaching relationship(s)");
  await expect(blockers).toContainText(
    "Ask a Center Manager to reassign or close them",
  );
  await expect(
    blockers.getByRole("link", { name: "View account details" }),
  ).toHaveAttribute("href", `/admin/users/${row.userId}`);
  await expect(
    blockers.getByRole("button", { name: "Copy Coach management link" }),
  ).toBeVisible();
  await expect(
    blockers.getByRole("button", { name: "Copy Receptionist member link" }),
  ).toHaveCount(0);
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
    await page
      .getByRole("button", { name: "Manage access", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Reason", { exact: true })
      .fill("Approved account change");
    await dialog.getByRole("button", { name: action, exact: true }).click();
    const before = writes;
    await expect(dialog).toContainText("Approved account change");
    expect(writes).toBe(before);
    await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
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

test("staff creation sends an activation request with Coach specialties and no password", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/users/admin/staff", (route) => {
    writes++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      email: "new@example.com",
      fullName: "New staff",
      phone: null,
      roleId: 2,
      specialties: [3],
    });
    return route.fulfill({ status: 201, json: account });
  });
  await page.goto("/admin/users?create=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name", { exact: true }).fill("New staff");
  await dialog.getByLabel("Email", { exact: true }).fill("new@example.com");
  await dialog.getByLabel("Role", { exact: true }).selectOption("COACH");
  const review = dialog.getByRole("button", {
    name: "Review staff account",
    exact: true,
  });
  await expect(review).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Badminton", exact: true })
    .check();
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveCount(0);
  await review.click();
  await expect(dialog.getByRole("list")).toContainText("Badminton");
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(dialog).toHaveCount(0);
});

test("Admin can create a named staff account without a phone or administrator-supplied password", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/users/admin/staff", (route) => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({
      email: "handoff@gmail.com",
      fullName: "Staff recipient",
      phone: null,
      roleId: 1,
      specialties: [],
    });
    return route.fulfill({ status: 201, json: account });
  });
  await page.goto("/admin/users?create=1");
  const dialog = page.getByRole("dialog");
  const review = dialog.getByRole("button", {
    name: "Review staff account",
    exact: true,
  });
  await expect(review).toBeDisabled();
  await dialog.getByLabel("Full name", { exact: true }).fill("Staff recipient");
  await dialog.getByLabel("Email", { exact: true }).fill("handoff@gmail.com");
  await dialog
    .getByLabel("Role", { exact: true })
    .selectOption("CENTER_MANAGER");
  await expect(dialog.getByLabel("Password", { exact: true })).toHaveCount(0);
  await review.click();
  expect(writes).toBe(0);
  await dialog
    .getByRole("button", { name: "Edit change", exact: true })
    .click();
  await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue(
    "handoff@gmail.com",
  );
  await review.click();
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(dialog).toHaveCount(0);
});

test("staff creation preserves the review when the API rejects a duplicate email", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/users/admin/staff", (route) =>
    route.fulfill({
      status: 409,
      json: { code: "email_already_exists", message: "Email already exists." },
    }),
  );
  await page.goto("/admin/users?create=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name", { exact: true }).fill("Staff recipient");
  await dialog
    .getByLabel("Email", { exact: true })
    .fill("existing@example.com");
  await dialog
    .getByRole("button", { name: "Review staff account", exact: true })
    .click();
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Email already exists.",
  );
  await dialog
    .getByRole("button", { name: "Edit change", exact: true })
    .click();
  await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue(
    "existing@example.com",
  );
});
test("own Administrator row hides access changes; details offer the personal account only", async ({
  page,
}) => {
  await setup(page, { self: true });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("button", { name: "Manage access", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Manage access", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Personal account", exact: true }),
  ).toHaveAttribute("href", "/account");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toHaveCount(0);
  for (const action of ["Lock", "Unlock", "Deactivate"])
    await expect(
      page.getByRole("button", { name: action, exact: true }),
    ).toHaveCount(0);
});

test("another Administrator has no role-change controls in the list or account details", async ({
  page,
}) => {
  const row = await setup(page);
  row.role = "SYSTEM_ADMINISTRATOR";
  let roleWrites = 0;
  await page.route(`**/api/users/${row.userId}/role`, (route) => {
    roleWrites++;
    return route.fulfill({ json: row });
  });
  for (const path of ["/admin/users", `/admin/users/${row.userId}`]) {
    await page.goto(path);
    await page
      .getByRole("button", { name: "Manage access", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Role", { exact: true })).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Save changes", exact: true }),
    ).toHaveCount(0);
    await expect(dialog).toContainText("Administrator roles cannot be changed");
    await expect(
      dialog.getByRole("button", { name: "Lock", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expect(roleWrites).toBe(0);
});

test("non-Admin cannot mount account detail or make its API request", async ({
  page,
}) => {
  await setup(page, { role: "MEMBER" });
  let detailsRequested = false;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === `/api/users/admin/${account.userId}`
    )
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
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Approved access change");
  await dialog.getByRole("button", { name: "Lock", exact: true }).click();
  await dialog.getByRole("button", { name: /^Confirm(?: update)?$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("dl").first()).toContainText("Locked");
  await page.reload();
  await expect(page.locator("dl").first()).toContainText("Locked");
});

test("Member accounts cannot be converted to staff and show how to create a staff account", async ({
  page,
}) => {
  const row = await setup(page);
  row.role = "MEMBER";
  await page.goto("/admin/users");
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Member accounts cannot be converted to staff. Create a staff account with a different email instead.",
  );
  await expect(dialog.getByLabel("Role", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save changes", exact: true }),
  ).toHaveCount(0);
});

test("pending staff show Activation required in the list, details and edit dialog", async ({
  page,
}) => {
  const row = await setup(page);
  row.activationPending = true;
  row.hasPassword = false;
  await page.goto("/admin/users");
  await expect(
    page.getByRole("table", { name: "Users and roles" }),
  ).toContainText("Activation required");
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Activation required");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Back to accounts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Activation required", { exact: true }),
  ).toBeVisible();
});
test("activated staff do not show pending-activation actions", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("table", { name: "Users and roles" }),
  ).not.toContainText("Activation required");
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Resend activation link" }),
  ).toHaveCount(0);
});

test("Coach specialties save without changing role and preserve edits on failure", async ({
  page,
}) => {
  const row = await setup(page);
  row.role = "COACH";
  row.sportIds = [3];
  await page.route("**/api/sports", (route) =>
    route.fulfill({
      json: [
        {
          sportId: 3,
          name: "Badminton",
          isActive: true,
          services: [{ serviceType: "GROUP_COURSE", isEnabled: true }],
        },
        {
          sportId: 4,
          name: "Basketball",
          isActive: true,
          services: [{ serviceType: "GROUP_COURSE", isEnabled: true }],
        },
      ],
    }),
  );
  let writes = 0;
  await page.route("**/api/users/" + row.userId + "/role", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      role: "COACH",
      reason: "Teach both sports",
      sportIds: [3, 4],
    });
    writes++;
    if (writes === 1)
      return route.fulfill({
        status: 409,
        json: { error: "invalid_sport", message: "Sport is no longer active" },
      });
    row.sportIds = [3, 4];
    return route.fulfill({ json: row });
  });
  await page.goto("/admin/users");
  await page
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", {
    name: "Save changes",
    exact: true,
  });
  await dialog.getByLabel("Reason", { exact: true }).fill("Teach both sports");
  await expect(save).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Badminton", exact: true })
    .uncheck();
  await expect(save).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "Badminton", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Basketball", exact: true })
    .check();
  await expect(save).toBeEnabled();
  await page.screenshot({
    path: test.info().outputPath("coach-editor-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(save).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("coach-editor-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await save.click();
  await expect(dialog).toContainText("Specialties added");
  await expect(dialog).toContainText("Basketball");
  await expect(dialog).not.toContainText("Current role");
  await expect(dialog).not.toContainText("invalidates existing sessions");
  expect(writes).toBe(0);
  await dialog
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await expect(dialog).toContainText("Sport is no longer active");
  await dialog
    .getByRole("button", { name: "Edit change", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "Basketball", exact: true }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue(
    "Teach both sports",
  );
  await save.click();
  await dialog
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(2);
});

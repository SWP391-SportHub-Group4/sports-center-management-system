import { expect, test, type Page } from "@playwright/test";

const id = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-14T03:00:00Z");
const deadline = "2026-10-20T03:00:00Z";

test("Account status filters activation required through the API and URL", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/users");
  const request = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return (
      url.pathname === "/api/users/admin" &&
      url.searchParams.get("status") === "ACTIVATION_REQUIRED"
    );
  });
  await page
    .getByLabel("Account status", { exact: true })
    .selectOption("ACTIVATION_REQUIRED");
  await request;
  expect(new URL(page.url()).searchParams.get("status")).toBe(
    "ACTIVATION_REQUIRED",
  );
  await expect(page.getByRole("table")).toContainText("Activation required");
  await page.reload();
  await expect(page.getByLabel("Account status", { exact: true })).toHaveValue(
    "ACTIVATION_REQUIRED",
  );
});

async function setup(
  page: Page,
  role = "SYSTEM_ADMINISTRATOR",
  expired = false,
) {
  await page.clock.install({ time: now });
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture-token"),
  );
  let account = {
    userId: id,
    fullName: "Pending Employee",
    email: "mistyped@example.com",
    phone: null,
    role: "RECEPTIONIST",
    status: "ACTIVE",
    sportIds: [],
    hasPassword: false,
    hasGoogleLink: false,
    activationPending: true,
    createdAt: "2026-10-13T03:00:00Z",
    activationExpiresAtUtc: expired ? "2026-10-14T02:00:00Z" : deadline,
    activationResendAvailableAtUtc: null as string | null,
  };
  const mutations: { path: string; body: unknown }[] = [];
  const auditQueries: URL[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          ...account,
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Reader",
          role,
          hasPassword: true,
        },
      });
    if (path.endsWith("/resend-activation")) {
      mutations.push({ path, body: null });
      account = {
        ...account,
        activationResendAvailableAtUtc: "2026-10-14T03:01:00Z",
      };
      return route.fulfill({ json: account });
    }
    if (path.endsWith("/email") && route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      mutations.push({ path, body });
      account = {
        ...account,
        email: body.email,
        activationResendAvailableAtUtc: "2026-10-14T03:01:00Z",
      };
      return route.fulfill({ json: account });
    }
    if (path === `/api/users/admin/${id}`)
      return route.fulfill({ json: account });
    if (path === "/api/users/admin")
      return route.fulfill({
        json: { items: [account], totalCount: 1, page: 1, pageSize: 20 },
      });
    if (path.endsWith("/unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/audit-logs/actions")
      return route.fulfill({ json: ["CREATE_CLASS"] });
    if (path === "/api/audit-logs") {
      auditQueries.push(url);
      return route.fulfill({
        json: {
          items: [
            {
              auditId: id,
              userId: id,
              actorEmail: "manager@example.com",
              actorRole: "CENTER_MANAGER",
              action: "CREATE_CLASS",
              targetEntity: "Class",
              targetId: "1",
              currentTargetLabel: "Basketball course",
              timestamp: now.toISOString(),
              oldValue: null,
              newValue: '{"name":"Basketball course"}',
              ipAddress: "127.0.0.1",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  return { mutations, auditQueries };
}

test("staff email correction requires review and retains the original deadline", async ({
  page,
}) => {
  const { mutations } = await setup(page);
  await page.goto(`/admin/users/${id}`);
  await page.getByRole("button", { name: "Edit email", exact: true }).click();
  await page
    .getByLabel("New email", { exact: true })
    .fill("correct@example.com");
  await page.getByLabel("Reason", { exact: true }).fill("Fix typing mistake");
  await page.getByRole("button", { name: "Review correction" }).click();
  expect(mutations).toHaveLength(0);
  await expect(page.getByRole("dialog")).toContainText("correct@example.com");
  await page
    .getByRole("button", { name: "Confirm and send activation email" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("correct@example.com");
  expect(mutations).toEqual([
    {
      path: `/api/users/${id}/email`,
      body: { email: "correct@example.com", reason: "Fix typing mistake" },
    },
  ]);
  await expect(page.locator("main")).toContainText("20/10/2026");
});

test("resend is available in the list and obeys the cooldown", async ({
  page,
}) => {
  const { mutations } = await setup(page);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: /^More activation actions/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Staff account activation" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resend activation email", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText(
    "Activation email sent.",
  );
  expect(mutations).toHaveLength(1);
  await page.clock.fastForward(61_000);
  await expect(
    page.getByRole("button", { name: "Resend activation email", exact: true }),
  ).toBeEnabled();
});

test("only Activation required rows have a More button, and its popup closes with Escape", async ({
  page,
}) => {
  await setup(page);
  const base = {
    userId: id,
    fullName: "Pending Employee",
    email: "pending@example.com",
    role: "RECEPTIONIST",
    status: "ACTIVE",
    sportIds: [],
    hasPassword: false,
    hasGoogleLink: false,
    activationPending: true,
    createdAt: "2026-10-13T03:00:00Z",
    activationExpiresAtUtc: deadline,
  };
  const rows = [
    base,
    {
      ...base,
      userId: "33333333-3333-4333-8333-333333333333",
      fullName: "Activated Employee",
      hasPassword: true,
      activationPending: false,
    },
    {
      ...base,
      userId: "44444444-4444-4444-8444-444444444444",
      fullName: "Locked Employee",
      status: "BANNED",
    },
    {
      ...base,
      userId: "55555555-5555-4555-8555-555555555555",
      fullName: "Inactive Employee",
      status: "DEACTIVATED",
    },
    {
      ...base,
      userId: "66666666-6666-4666-8666-666666666666",
      fullName: "Pending Member",
      role: "MEMBER",
    },
  ];
  await page.route("**/api/users/admin?**", (route) =>
    route.fulfill({
      json: { items: rows, totalCount: rows.length, page: 1, pageSize: 20 },
    }),
  );
  await page.goto("/admin/users");
  const more = page.getByRole("button", { name: /^More activation actions/ });
  await expect(more).toHaveCount(1);
  await expect(page.locator("details")).toHaveCount(0);
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("pending@example.com");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("list email correction stays inside one popup and updates the recipient", async ({
  page,
}) => {
  const { mutations } = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/users");
  await page.getByRole("button", { name: /^More activation actions/ }).click();
  await page.getByRole("button", { name: "Edit email", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByLabel("New email", { exact: true })
    .fill("correct@example.com");
  await page.getByLabel("Reason", { exact: true }).fill("Fix typing mistake");
  await page
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(mutations).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm and send activation email" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("correct@example.com");
  await expect(page.getByRole("dialog")).toContainText(
    "Email corrected and activation email queued",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Edit email", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^More activation actions/ }),
  ).toBeFocused();
});

test("expired staff invitations cannot be corrected or resent", async ({
  page,
}) => {
  await setup(page, "SYSTEM_ADMINISTRATOR", true);
  await page.goto(`/admin/users/${id}`);
  await expect(
    page.getByRole("button", { name: "Edit email", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Resend activation email", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText("Activation expired");
});

test("Admin audit shows operational events and its role filter includes System", async ({
  page,
}) => {
  const { auditQueries } = await setup(page);
  await page.goto("/admin/audit-log");
  await page
    .getByRole("table")
    .getByRole("button", { name: /View details:/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Basketball course");
  await page.keyboard.press("Escape");
  expect(auditQueries[0].searchParams.get("targetEntity")).toBeNull();
  await expect(page.locator('a[href="/manager/classes/1"]')).toHaveCount(0);
  const filter = page.getByLabel("Role at event time", { exact: true });
  await expect(filter.locator('option[value="SYSTEM"]')).toHaveCount(1);
  await expect(filter.locator('option[value="MEMBER"]')).toHaveCount(0);
  await filter.selectOption("COACH");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect
    .poll(() => auditQueries.at(-1)?.searchParams.get("actorRole"))
    .toBe("COACH");
});

test("Manager audit offers operational roles and excludes Administrator and System", async ({
  page,
}) => {
  await setup(page, "CENTER_MANAGER");
  await page.goto("/manager/audit-log");
  const filter = page.getByLabel("Role at event time", { exact: true });
  await expect(filter.locator('option[value="RECEPTIONIST"]')).toHaveCount(1);
  await expect(filter.locator('option[value="MEMBER"]')).toHaveCount(1);
  await expect(
    filter.locator('option[value="SYSTEM_ADMINISTRATOR"]'),
  ).toHaveCount(0);
  await expect(filter.locator('option[value="SYSTEM"]')).toHaveCount(0);
});

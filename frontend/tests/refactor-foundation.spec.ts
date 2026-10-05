import { expect, test } from "@playwright/test";

// Mocked HTTP UI regression tests. These do not certify backend integration.
test("F5 ignores stale cached role and refreshes the authoritative profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem(
      "sporthub.user",
      JSON.stringify({
        role: "SystemAdministrator",
        fullName: "Stale administrator",
      }),
    );
  });
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: {
        userId: "member-1",
        email: "member@example.com",
        fullName: "Current Member",
        role: "MEMBER",
        sportIds: [],
      },
    }),
  );
  await page.route("**/api/members/me/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("enrollments")
        ? { items: [], page: 1, pageSize: 5, totalCount: 0 }
        : [],
    }),
  );
  await page.route("**/api/wallet/me", (route) =>
    route.fulfill({
      json: { availablePoints: 250, heldPoints: 30, vndPerPoint: 1000 },
    }),
  );
  await page.route("**/api/notifications**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/member");
  await expect(page.locator("#main-content h1")).toHaveText("Member space");
  await expect(page.getByText("Stale administrator")).toHaveCount(0);
  await expect(page.getByText("Current Member").first()).toBeVisible();
  await expect(page.getByText("250", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#main-content h1")).toHaveText("Member space");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("#main-content h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/p2-member-${width}.png`,
      fullPage: true,
    });
  }
});

test("forgot password emails a link, reports unknown accounts, and reset page sets the new password", async ({
  page,
}) => {
  let payload: Record<string, unknown> | null = null;
  let known = true;
  await page.route("**/api/auth/password/forgot", (route) =>
    known
      ? route.fulfill({ status: 204 })
      : route.fulfill({
          status: 404,
          json: { error: "account_not_found", message: "Khong co tai khoan" },
        }),
  );
  await page.route("**/api/auth/password/reset", (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 204 });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("nobody@example.com");
  known = false;
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator(".auth [role=alert]")).toContainText(
    "No account uses this email address.",
  );
  known = true;
  await page.getByLabel("Email", { exact: true }).fill("person@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "We sent a password reset link to",
  );
  await expect(
    page.getByRole("button", { name: /Resend link/ }),
  ).toBeDisabled();

  await page.goto("/reset-password?email=person%40example.com&token=abc123");
  const password = page.getByLabel("New password", { exact: true });
  await password.fill("New-Strong-Pass1!");
  await page.getByRole("button", { name: "Show" }).first().click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("New-Strong-Pass1!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password reset.");
  expect(payload).toEqual({
    email: "person@example.com",
    token: "abc123",
    newPassword: "New-Strong-Pass1!",
    confirmNewPassword: "New-Strong-Pass1!",
  });
});

test("expired reset link offers a new one", async ({ page }) => {
  await page.route("**/api/auth/password/reset", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "otp_expired", message: "het han" },
    }),
  );
  await page.goto("/reset-password?email=person%40example.com&token=old");
  await page
    .getByLabel("New password", { exact: true })
    .fill("New-Strong-Pass1!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("New-Strong-Pass1!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.locator(".auth [role=alert]")).toContainText("invalid or has expired");
  await expect(
    page.getByRole("link", { name: "Request a new link" }),
  ).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.locator(".auth [role=alert]")).toContainText("invalid or has expired");
});

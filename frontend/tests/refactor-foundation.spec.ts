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

test("password reset sends direct OTP and confirm fields, with neutral notice and cooldown", async ({
  page,
}) => {
  let payload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/password/forgot", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/auth/password/reset", (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 204 });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("person@example.com");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "If the account can be reset",
  );
  await expect(page.getByRole("button", { name: /Resend/ })).toBeDisabled();
  await page.getByLabel("Email verification code").fill("123456");
  await page
    .getByLabel("New password", { exact: true })
    .fill("New-Strong-Pass1!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("New-Strong-Pass1!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password reset.");
  expect(payload).toEqual({
    email: "person@example.com",
    otpCode: "123456",
    newPassword: "New-Strong-Pass1!",
    confirmNewPassword: "New-Strong-Pass1!",
  });
});

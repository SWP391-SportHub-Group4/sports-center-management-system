import { expect, test } from "@playwright/test";

test("public header and section links work without an account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login",
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Activities" })
    .click();
  await expect(page).toHaveURL(/#(activities|hoat-dong)$/);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "smooth");
});

test("successful login routes each role to its dashboard", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "test-token",
        user: {
          userId: "coach-1",
          email: "coach@sporthub.test",
          fullName: "Coach Minh",
          role: "Coach",
        },
      }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@sporthub.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/coach$/);
});

test("password visibility and login errors do not move the submit button", async ({
  page,
}) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        message: "The email or password is incorrect.",
      }),
    });
  });
  await page.goto("/login");
  const password = page.getByLabel("Password");
  await password.fill("password123");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(password).toHaveAttribute("type", "password");

  await page.getByLabel("Email").fill("member@sporthub.test");
  const submit = page.getByRole("button", { name: "Sign in" });
  const before = await submit.boundingBox();
  await submit.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The email or password is incorrect." }),
  ).toBeVisible();
  const after = await submit.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(5);
});

test("authenticated public header shows the member name", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem(
      "sporthub.user",
      JSON.stringify({
        userId: "member-1",
        email: "member@sporthub.test",
        fullName: "Alex Johnson",
        role: "Member",
      }),
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Alex Johnson/ }),
  ).toHaveAttribute("href", "/member");
});

test("protected role page sends guests to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("disables smooth scrolling", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  });
});

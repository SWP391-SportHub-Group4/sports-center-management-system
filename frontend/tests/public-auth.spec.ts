import { expect, test } from "@playwright/test";

test("public header and section links work without an account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/login");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Sports", exact: true })
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
  const submitTop = () =>
    submit.evaluate(
      (button) => button.getBoundingClientRect().top + window.scrollY,
    );
  const before = await submitTop();
  await submit.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The email or password is incorrect." }),
  ).toBeVisible();
  const after = await submitTop();
  expect(Math.abs(after - before)).toBeLessThanOrEqual(5);
});

test("login shows inline required errors without browser validation tooltips", async ({ page }) => {
  let loginRequests = 0;
  await page.route("**/api/auth/login", (route) => {
    loginRequests += 1;
    return route.abort();
  });
  await page.goto("/login");
  const form = page.locator("form");
  const email = form.locator('input[type="email"]');
  const password = form.locator('input[type="password"]');
  const submit = form.locator('button[type="submit"]');
  await expect(form).toHaveAttribute("novalidate", "");
  const submitTop = () =>
    submit.evaluate(
      (button) => button.getBoundingClientRect().top + window.scrollY,
    );
  const before = await submitTop();

  await submit.click();
  await expect(form.getByText("Please fill out this field.")).toHaveCount(2);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  const after = await submitTop();
  expect(Math.abs(after - before)).toBeLessThanOrEqual(5);
  expect(loginRequests).toBe(0);

  await email.fill("member@sporthub.test");
  await password.fill("password123");
  await expect(form.getByText("Please fill out this field.")).toHaveCount(0);
});

test("authenticated public header shows the member name", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "00000000-0000-4000-8000-000000000001",
          email: "member@sporthub.test",
          fullName: "Alex Johnson",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  // Tên người dùng nằm trên nút mở menu tài khoản; mục "My space" dẫn tới dashboard theo vai trò.
  await page.getByRole("button", { name: /Alex Johnson/ }).click();
  await expect(
    page.getByRole("link", { name: "My space", exact: true }),
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

test("public events do not mint a client-side access pass", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel(/turnstile qr/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /generate instant pass|kích hoạt vé tức thì/i,
    }),
  ).toHaveCount(0);
});

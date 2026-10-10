import { expect, test, type Page } from "@playwright/test";

async function mockCoachDashboard(page: Page) {
  // Login fixtures use a fake token. Keep dashboard requests inside the fixture
  // so a running API cannot return 401 and clear the just-created session.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (
      path === "/api/notifications" ||
      path === "/api/coaches/me/classes" ||
      path === "/api/coach-member-relationships" ||
      path.includes("/pt-sessions")
    )
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
}

async function waitForLoginLayout(page: Page) {
  const card = page.locator(".auth__card");
  await expect(card.locator("form")).toBeVisible();
  // The Suspense login form can mount after page load. Its fonts may still
  // change title wrapping, and the card entrance animation changes its position.
  // Measure validation layout changes only after both have settled.
  await card.evaluate(async (element) => {
    await document.fonts.ready;
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

async function openPublicNavigation(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  if (!(await navigation.isVisible())) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  }
  await expect(navigation).toBeVisible();
  return navigation;
}

for (const width of [1440, 1280, 390]) {
  test(`public header and section links work without an account (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const navigation = await openPublicNavigation(page);
    await expect(
      navigation.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveAttribute("href", "/login");
    await expect(
      navigation.getByRole("link", { name: "Sign up", exact: true }),
    ).toHaveAttribute("href", "/register");
    await navigation
      .getByRole("link", { name: "Discover SportHub", exact: true })
      .click();
    await expect(page).toHaveURL(/#sporthub$/);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "smooth");
    if (width < 1360) {
      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(navigation).toBeHidden();
    }
  });
}

test("successful login routes each role to its dashboard", async ({ page }) => {
  await mockCoachDashboard(page);
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: {
        userId: "coach-1",
        email: "coach@sporthub.test",
        fullName: "Coach Minh",
        role: "Coach",
        sportIds: [],
      },
    }),
  );
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
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/coach$/);
});

test("branded Google button keeps the Google credential flow", async ({
  page,
}) => {
  await mockCoachDashboard(page);
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: {
        userId: "coach-1",
        email: "coach@sporthub.test",
        fullName: "Coach Minh",
        role: "Coach",
        sportIds: [],
      },
    }),
  );
  await page.route("https://accounts.google.com/gsi/client**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
        initialize(options) { window.googleCallback = options.callback; },
        renderButton(host) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Google SDK";
          button.style.width = "100%";
          button.style.height = "48px";
          button.onclick = () => window.googleCallback({ credential: "mock-google-id-token" });
          host.append(button);
        }
      } } };`,
    }),
  );
  await page.route("**/api/auth/google", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      idToken: "mock-google-id-token",
    });
    return route.fulfill({
      json: {
        accessToken: "test-token",
        user: {
          userId: "coach-1",
          email: "coach@sporthub.test",
          fullName: "Coach Minh",
          role: "Coach",
        },
      },
    });
  });
  await page.goto("/login");
  const google = page.locator(".google-sign-in-wrap--ready");
  const visual = google.locator(".google-sign-in__visual");
  await expect(google).toBeVisible();
  await expect(visual).toHaveCSS("background-color", "rgb(26, 56, 44)");
  await page.mouse.move(0, 0);
  await expect(visual).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
  await google.hover();
  await expect(visual).toHaveCSS("border-color", "rgba(143, 202, 161, 0.7)");
  await page.mouse.move(0, 0);
  await expect(visual).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
  await google.click();
  await expect(page).toHaveURL(/\/coach$/);
});

test("password visibility and credential errors remain accessible", async ({
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
  const submit = page.locator('form button[type="submit"]');
  await waitForLoginLayout(page);
  await submit.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "The email or password is incorrect." }),
  ).toBeVisible();
  await expect(submit).toBeVisible();
});

test("login validation grows naturally with spacing below each field", async ({
  page,
}) => {
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
  await waitForLoginLayout(page);
  const formHeightBefore = await form.evaluate(
    (element) => element.clientHeight,
  );

  await submit.click();
  await expect(form.getByText("Please fill out this field.")).toHaveCount(2);
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  const formHeightAfter = await form.evaluate(
    (element) => element.clientHeight,
  );
  expect(formHeightAfter).toBeGreaterThan(formHeightBefore);
  const spacing = await form.evaluate((element) => {
    const inputs = element.querySelectorAll("input");
    const errors = element.querySelectorAll('[role="alert"]');
    const forgot = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Forgot password?",
    );
    return {
      emailTop:
        errors[0].getBoundingClientRect().top -
        inputs[0].getBoundingClientRect().bottom,
      nextTop:
        inputs[1].getBoundingClientRect().top -
        errors[0].getBoundingClientRect().bottom,
      passwordTop:
        errors[1].getBoundingClientRect().top -
        inputs[1].getBoundingClientRect().bottom,
      forgotTop:
        forgot!.getBoundingClientRect().top -
        errors[1].getBoundingClientRect().bottom,
    };
  });
  expect(spacing.emailTop).toBeGreaterThanOrEqual(6);
  expect(spacing.passwordTop).toBeGreaterThanOrEqual(6);
  expect(spacing.nextTop).toBeGreaterThanOrEqual(8);
  expect(spacing.forgotTop).toBeGreaterThanOrEqual(8);
  expect(loginRequests).toBe(0);

  await email.fill("member@sporthub.test");
  await password.fill("password123");
  await expect(form.getByText("Please fill out this field.")).toHaveCount(0);
});

test("registration code supports six digits, editing, and paste", async ({
  page,
}) => {
  await page.route("**/api/auth/register/otp", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto("/register");
  await page.getByLabel("Email").fill("member@sporthub.test");
  await page.getByRole("button", { name: "Send code" }).click();

  const digits = page
    .getByRole("group", { name: "Verification code" })
    .locator("input");
  await expect(digits).toHaveCount(6);
  await page.getByRole("button", { name: "Change" }).click();
  await expect(digits).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeEnabled();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(digits).toHaveCount(6);
  await digits.first().focus();
  await page.keyboard.type("123456");
  for (let index = 0; index < 6; index += 1) {
    await expect(digits.nth(index)).toHaveValue(String(index + 1));
  }

  await digits.last().fill("");
  await digits.last().press("Backspace");
  await expect(digits.nth(4)).toBeFocused();
  await expect(digits.nth(4)).toHaveValue("");

  await digits.first().evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "654321");
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  });
  for (let index = 0; index < 6; index += 1) {
    await expect(digits.nth(index)).toHaveValue(String(6 - index));
  }
  await page.getByRole("button", { name: "Step 2" }).click();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByText("Back to email step")).toHaveCount(0);
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Verification code" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "← Back", exact: true }),
  ).toHaveAttribute("href", "/");
  for (let index = 0; index < 6; index += 1) {
    await expect(digits.nth(index)).toHaveValue(String(6 - index));
  }
});

test("registration errors keep readable gaps without overlap", async ({
  page,
}) => {
  await page.route("**/api/auth/register/otp", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  const email = page.getByLabel("Email");
  await expect(email).toHaveAttribute("placeholder", "example@gmail.com");
  await page.getByRole("button", { name: "Send code" }).click();
  const emailError = page.getByText("Please fill out this field.");
  await expect(emailError).toBeVisible();
  const emailGap = await page.evaluate(() => {
    const field = document.querySelector('input[type="email"]')!;
    const error = document.querySelector('[role="alert"]')!;
    const footer = document.querySelector(".auth__signin-prompt")!;
    return {
      above:
        error.getBoundingClientRect().top -
        field.getBoundingClientRect().bottom,
      below:
        footer.getBoundingClientRect().top -
        error.getBoundingClientRect().bottom,
    };
  });
  expect(emailGap.above).toBeGreaterThanOrEqual(6);
  expect(emailGap.below).toBeGreaterThanOrEqual(8);

  await email.fill("member@sporthub.test");
  await page.getByRole("button", { name: "Send code" }).click();
  const otp = page.getByRole("group", { name: "Verification code" });
  await expect(otp).toBeVisible();
  const actions = page.locator(".otp-box__actions");
  const before = await actions.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await page.getByRole("button", { name: "Step 2" }).click();
  await expect(page.getByText("Please fill out this field.")).toBeVisible();
  const after = await actions.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(after).toBeGreaterThan(before);
  await expect(otp.locator("input").first()).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

for (const width of [1440, 1280, 390]) {
  test(`authenticated public header shows the member name (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
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
    await openPublicNavigation(page);
    // Tên người dùng nằm trên nút mở menu tài khoản; mục "My space" dẫn tới dashboard theo vai trò.
    await page.getByRole("button", { name: /Alex Johnson/ }).click();
    await expect(
      page.getByRole("link", { name: "My space", exact: true }),
    ).toHaveAttribute("href", "/member");
  });
}

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

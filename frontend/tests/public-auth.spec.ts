import { expect, test } from "@playwright/test";

test("public header and section links work without an account", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
    "href",
    "/dang-nhap",
  );
  await page.getByRole("link", { name: "Hoạt động" }).click();
  await expect(page).toHaveURL(/#hoat-dong$/);
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
          fullName: "Huấn luyện viên Minh",
          role: "Coach",
        },
      }),
    });
  });
  await page.goto("/dang-nhap");
  await page.getByLabel("Email").fill("coach@sporthub.test");
  await page.getByLabel("Mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/hlv$/);
  await expect(
    page.getByRole("heading", { name: "Xin chào, Huấn luyện viên Minh" }),
  ).toBeVisible();
});

test("password visibility and login errors do not move the submit button", async ({
  page,
}) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email hoặc mật khẩu không đúng." }),
    });
  });
  await page.goto("/dang-nhap");
  const password = page.getByLabel("Mật khẩu");
  await password.fill("password123");
  await page.getByRole("button", { name: "Hiện" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ẩn" }).click();
  await expect(password).toHaveAttribute("type", "password");

  await page.getByLabel("Email").fill("member@sporthub.test");
  const submit = page.getByRole("button", { name: "Đăng nhập" });
  const before = await submit.boundingBox();
  await submit.click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Email hoặc mật khẩu không đúng." }),
  ).toBeVisible();
  const after = await submit.boundingBox();
  expect(after?.y).toBe(before?.y);
});

test("authenticated public header shows the member name", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem(
      "sporthub.user",
      JSON.stringify({
        userId: "member-1",
        email: "member@sporthub.test",
        fullName: "Nguyễn Minh",
        role: "Member",
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Nguyễn Minh/ })).toHaveAttribute(
    "href",
    "/hoi-vien",
  );
});

test("protected role page sends guests to login", async ({ page }) => {
  await page.goto("/quan-tri");
  await expect(page).toHaveURL(/\/dang-nhap\?tiep-tuc=%2Fquan-tri$/);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("disables smooth scrolling", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  });
});

import { expect, test, type Page } from "@playwright/test";

// Tài khoản đăng ký bằng Google (password_hash = NULL): tạo mật khẩu trong Cài đặt tài khoản kèm mã OTP gửi về email.

const account = (hasPassword: boolean) => ({
  userId: "u1",
  email: "google.user@example.com",
  fullName: "Google User",
  phone: null,
  role: "MEMBER",
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  hasPassword,
  hasGoogleLink: true,
  sportIds: [],
});

async function signedIn(page: Page, hasPassword: boolean) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "t");
    localStorage.setItem("sporthub_lang", "vi");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({ json: account(hasPassword) });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    return route.fulfill({ json: [] });
  });
}

test("tài khoản Google chưa có mật khẩu: gửi mã, nhập mã và tạo mật khẩu", async ({
  page,
}) => {
  await signedIn(page, false);
  let otpRequests = 0;
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/users/me/password/otp", (route) => {
    otpRequests += 1;
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/users/me/password", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ json: { accessToken: "fresh-token" } });
  });
  await page.goto("/account");
  await page.getByRole("tab", { name: "Security", exact: true }).click();

  await expect(
    page.getByText(/created with Google and does not have a password/),
  ).toBeVisible();
  await expect(page.getByLabel("Current password")).toHaveCount(0);

  // Chưa có mã thì không được gửi
  await page
    .getByLabel("New password", { exact: true })
    .fill("Brand-New-Pass-2?");
  await page.getByLabel("Confirm new password").fill("Brand-New-Pass-2?");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("Enter the 6-digit code from your email."),
  ).toBeVisible();
  expect(body).toBeNull();

  await page.getByRole("button", { name: "Send confirmation code" }).click();
  await expect(
    page.getByText(/We sent a 6-digit code to google.user@example.com/),
  ).toBeVisible();
  expect(otpRequests).toBe(1);
  // Đang chờ gửi lại: nút bị khóa và hiện đếm ngược
  await expect(
    page.getByRole("button", { name: /Send a new code in \d+s/ }),
  ).toBeDisabled();

  await page.getByLabel("Confirmation code").fill("123456");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Password updated successfully.")).toBeVisible();
  expect(body).toMatchObject({
    otpCode: "123456",
    newPassword: "Brand-New-Pass-2?",
    currentPassword: null,
  });
});

test("mã sai được báo lỗi từ máy chủ và không mất dữ liệu đã nhập", async ({
  page,
}) => {
  await signedIn(page, false);
  await page.route("**/api/users/me/password", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "otp_invalid", message: "Mã xác thực không đúng." },
    }),
  );
  await page.goto("/account");
  await page.getByRole("tab", { name: "Security", exact: true }).click();
  await page.getByLabel("Confirmation code").fill("000000");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Brand-New-Pass-2?");
  await page.getByLabel("Confirm new password").fill("Brand-New-Pass-2?");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Mã xác thực không đúng.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue(
    "Brand-New-Pass-2?",
  );
});

test("tài khoản đã có mật khẩu vẫn đổi bằng mật khẩu hiện tại, không có bước mã", async ({
  page,
}) => {
  await signedIn(page, true);
  await page.goto("/account");
  await page.getByRole("tab", { name: "Security", exact: true }).click();
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send confirmation code" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
});

test("đăng nhập Google vào trang đăng nhập: không còn bước onboarding", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page
      .getByLabel(/Google/i)
      .first()
      .or(page.getByRole("button", { name: /Google/i }).first()),
  ).toBeVisible();
  await expect(page.getByText(/onboarding/i)).toHaveCount(0);
});

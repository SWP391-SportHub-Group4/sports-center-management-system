import { expect, test } from "@playwright/test";

// Trang xác thực luôn tiếng Anh, kể cả khi portal đã lưu ngôn ngữ tiếng Việt.
for (const path of [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password?email=a%40b.com&token=x",
  "/register-external-coach",
]) {
  test(`${path} stays English when Vietnamese is stored`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("sporthub_lang", "vi"));
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const text = await page.locator("main, body").first().innerText();
    expect(text).not.toMatch(
      /Đăng nhập|Mật khẩu|Gửi mã|Tạo tài khoản|Quên mật khẩu|Đặt lại/,
    );
  });
}

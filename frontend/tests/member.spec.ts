import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyCommand } from "../src/infrastructure/demo/member-repository";
import { createSeed } from "../src/infrastructure/demo/seed";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-14T03:00:00Z") });
});

test("booking persists, cancellation refunds the original package and focus returns", async ({
  page,
}) => {
  await page.goto("/member/calendar");
  await page
    .getByRole("button", { name: "Đặt lịch Thể lực cơ bản", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận đặt lịch", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Xem đăng ký Thể lực cơ bản",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Đã giữ chỗ", exact: true }).click();
  await page
    .getByRole("button", { name: "Xem đăng ký Thể lực cơ bản", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Xem đăng ký Thể lực cơ bản",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Xem đăng ký Thể lực cơ bản", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận hủy", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Xem đăng ký Thể lực cơ bản",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto("/member/profile");
  await expect(
    page.getByText("Còn 11 lượt tập", { exact: true }),
  ).toBeVisible();
});

test("profile validation focuses the invalid field and edits persist", async ({
  page,
}) => {
  await page.goto("/member/profile/edit");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("123");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByLabel("Số điện thoại", { exact: true })).toBeFocused();
  await expect(
    page.getByLabel("Số điện thoại", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Số điện thoại", { exact: true }).fill("0912345678");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Nguyễn Minh Triết");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu hồ sơ");
  await page.reload();
  await expect(page.getByLabel("Họ và tên", { exact: true })).toHaveValue(
    "Nguyễn Minh Triết",
  );
});

test("QR renews after sixty seconds and slider is manually operable", async ({
  page,
}) => {
  await page.goto("/member");
  const qr = page.getByTestId("member-qr");
  await expect(qr).toBeVisible();
  const first = await qr.getAttribute("src");
  await page.clock.fastForward(61000);
  await expect(qr).toBeVisible();
  await expect(qr).not.toHaveAttribute("src", first!);
  await page.getByRole("button", { name: "Tin tiếp theo" }).click();
  await expect(
    page.getByRole("heading", { name: "Tìm người đồng hành tập luyện" }),
  ).toBeVisible();
});

test("package request stays pending and does not unlock training", async ({
  page,
}) => {
  await page.goto("/member/packages");
  await page.getByRole("radio", { name: /Diamond/ }).check();
  await page.getByRole("button", { name: "Đăng ký gói", exact: true }).click();
  await page
    .getByRole("button", { name: "Xác nhận đăng ký gói", exact: true })
    .click();
  await expect(
    page.getByText("Chờ thanh toán tại quầy", { exact: true }),
  ).toBeVisible();
  await page.goto("/member/profile");
  await expect(
    page.getByRole("heading", { name: "Diamond All-Access" }),
  ).toHaveCount(0);
});

test("notifications read state survives reload", async ({ page }) => {
  await page.goto("/member/notifications");
  await page.getByRole("button", { name: "Đánh dấu đã đọc" }).first().click();
  await page.reload();
  await expect(page.getByText("Đã đọc", { exact: true })).toHaveCount(1);
});

for (const width of [320, 768, 1280])
  test(`all Member routes fit ${width}px with loaded assets`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "",
      "/calendar",
      "/coaches",
      "/profile",
      "/profile/edit",
      "/packages",
      "/training",
      "/history",
      "/notifications",
    ]) {
      await page.goto(`/member${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      ).toBeTruthy();
      await expect
        .poll(
          async () =>
            page
              .locator("img:visible")
              .evaluateAll((images) =>
                images.every(
                  (image) =>
                    image instanceof HTMLImageElement &&
                    image.complete &&
                    image.naturalWidth > 0,
                ),
              ),
          { message: `Images load on ${route || "/member"}` },
        )
        .toBeTruthy();
      if (route === "/calendar" || route === "")
        await page.screenshot({
          path: `test-results/member-${route === "" ? "home" : "calendar"}-${width}.png`,
          fullPage: true,
        });
    }
  });

test("Member pages pass automated WCAG A/AA checks", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "",
      "/calendar",
      "/coaches",
      "/profile/edit",
      "/packages",
      "/notifications",
    ]) {
      await page.goto(`/member${route}`);
      await expect(page.locator("#main-content h1")).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, route).toEqual([]);
    }
  }
});

test("demo booking rules reject duplicates/full classes and late cancellation does not refund", () => {
  const s = createSeed();
  const session = s.sessions.find((x) => x.id === "strength")!;
  const now = Date.parse(session.startAt) - 12 * 3600000;
  applyCommand(
    s,
    { type: "book", sessionId: session.id, memberPackageId: "member-gold" },
    now,
  );
  expect(s.packages[0].remainingSessions).toBe(10);
  expect(() =>
    applyCommand(
      s,
      { type: "book", sessionId: session.id, memberPackageId: "member-gold" },
      now,
    ),
  ).toThrow("đã giữ chỗ");
  applyCommand(
    s,
    { type: "cancel", sessionId: session.id },
    Date.parse(session.cancellationDeadline) + 1000,
  );
  expect(s.packages[0].remainingSessions).toBe(10);
  expect(s.enrollments.find((e) => e.sessionId === session.id)?.status).toBe(
    "CancelledLate",
  );
  expect(() =>
    applyCommand(
      s,
      { type: "book", sessionId: "pilates", memberPackageId: "member-gold" },
      now,
    ),
  ).toThrow("hết chỗ");
});

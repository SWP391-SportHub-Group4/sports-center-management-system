import { expect, test } from "@playwright/test";
import { memberCodePayload, parseMemberCode } from "../src/lib/member-code";

const id = "22222222-2222-4222-8222-222222222222";
const code = "opaque-server-issued-member-code-1234567890";

test("member code payload round-trips and rejects other text", () => {
  expect(parseMemberCode(memberCodePayload(code))).toBe(code);
  expect(parseMemberCode(` ${memberCodePayload(code)} `)).toBe(code);
  expect(parseMemberCode(id)).toBeNull();
  expect(parseMemberCode("https://example.com")).toBeNull();
  expect(parseMemberCode("SPORTHUB-MEMBER:not-a-guid")).toBeNull();
});

test("member card loads a short-lived code and displays its QR", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: id,
          fullName: "Member A",
          email: "member@example.com",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path === "/api/member-codes/me")
      return route.fulfill({
        json: {
          code,
          expiresAtUtc: new Date(Date.now() + 300_000).toISOString(),
        },
      });
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
  await page.goto("/member");
  // Header hiển thị tên nút để Member biết mã dùng cho việc gì.
  const memberCodeButton = page.getByRole("button", { name: "Show member QR code" });
  await expect(memberCodeButton.getByText("Member QR code")).toBeVisible();
  await memberCodeButton.click();
  await expect(page.getByRole("img", { name: "Member code QR" })).toBeVisible();
  await expect(page.getByText("does not grant entry by itself")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy member code" }),
  ).toBeEnabled();
});

test("receptionist sees the camera scanner ready in the member picker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "desk-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Desk",
          email: "desk@example.com",
          role: "RECEPTIONIST",
          sportIds: [],
        },
      });
    if (path === "/api/member-codes/lookup") {
      expect(route.request().postDataJSON()).toEqual({ code });
      return route.fulfill({
        json: {
          userId: id,
          fullName: "Member A",
          email: "member@example.com",
          phone: null,
          role: "MEMBER",
          status: "ACTIVE",
          sportIds: [],
        },
      });
    }
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/receptionist/gym-checkin");
  // Máy quét hiện sẵn, không cần bấm mở.
  await expect(page.getByText("Live Camera QR Scanner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scan member QR" }),
  ).toHaveCount(0);
  const picker = page.getByRole("textbox", { name: "Select Member" });
  await picker.fill(memberCodePayload(code));
  await picker.press("Enter");
  await expect(page.getByText("Member A")).toBeVisible();
});

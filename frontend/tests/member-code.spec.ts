import { expect, test } from "@playwright/test";
import { isMemberCode } from "../src/lib/member-code";

const id = "22222222-2222-4222-8222-222222222222";

test("only server-issued check-in codes are recognised by the desk", () => {
  expect(isMemberCode(" SPORTHUB-CODE:abc.123.sig ")).toBe(true);
  expect(isMemberCode("SPORTHUB-MEMBER:" + id)).toBe(false);
  expect(isMemberCode("SPORTHUB-DAYPASS:2026-10-13:" + id)).toBe(false);
  expect(isMemberCode(id)).toBe(false);
  expect(isMemberCode("https://example.com")).toBe(false);
});

test("member card shows the server identity with a scannable QR", async ({
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
    if (path === "/api/members/me/checkin-code")
      return route.fulfill({
        json: {
          code: "SPORTHUB-CODE:fixture.9999999999.signature",
          expiresAtUtc: "2026-10-13T17:00:00Z",
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
  // Mã nằm trong menu tài khoản, mở thành popup khi cần.
  await page.getByRole("button", { name: "Member A" }).click();
  await page.getByRole("button", { name: "Member code" }).click();
  await expect(page.getByRole("img", { name: "Member code QR" })).toBeVisible();
  await expect(page.getByText(/valid only today/)).toBeVisible();
  await expect(page.getByText(id)).toBeVisible();
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
});

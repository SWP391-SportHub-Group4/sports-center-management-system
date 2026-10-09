import { expect, test } from "@playwright/test";
import { memberCodePayload, parseMemberCode } from "../src/lib/member-code";

const id = "22222222-2222-4222-8222-222222222222";

test("member code payload round-trips and rejects other text", () => {
  expect(parseMemberCode(memberCodePayload(id))).toBe(id);
  expect(parseMemberCode(` ${id.toUpperCase()} `)).toBe(id);
  expect(parseMemberCode("https://example.com")).toBeNull();
  expect(parseMemberCode("SPORTHUB-MEMBER:not-a-guid")).toBeNull();
});

test("member card shows the server identity and explains unavailable issued QR", async ({
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
  // Mã nằm sau nút tròn trên thanh header, mở thành popup khi cần.
  await page.getByRole("button", { name: "Member code" }).click();
  await expect(page.getByRole("img", { name: "Member code QR" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Your center-issued QR is not available yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("does not grant entry by itself")).toBeVisible();
  await expect(page.getByText(id)).toBeVisible();
});

test("receptionist can open the camera scanner from the member picker", async ({
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
  await page.getByRole("button", { name: "Scan member QR" }).click();
  await expect(
    page.getByRole("button", { name: "Close scanner" }),
  ).toBeVisible();
});

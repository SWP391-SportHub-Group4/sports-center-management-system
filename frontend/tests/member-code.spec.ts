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

async function openCode(
  page: import("@playwright/test").Page,
  packages: unknown[],
) {
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
    if (path === "/api/members/me/packages")
      return route.fulfill({ json: packages });
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
  await page.getByRole("button", { name: "Member A" }).click();
  await page.getByRole("button", { name: "Member code" }).click();
}

test("member with an active Gym plan sees a scannable QR", async ({ page }) => {
  await openCode(page, [
    {
      status: "ACTIVE",
      isUsable: true,
      startDate: "2020-01-01",
      endDate: "2099-01-01",
    },
  ]);
  await expect(page.getByRole("img", { name: "Member code QR" })).toBeVisible();
  await expect(page.getByText("Valid today only")).toBeVisible();
});

test("member without a Gym plan is told why there is no code and where to buy", async ({
  page,
}) => {
  await openCode(page, []);
  await expect(page.getByText(/No check-in code yet/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Member code QR" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Buy a Gym plan" }),
  ).toHaveAttribute("href", "/member/services?section=gym&view=explore");
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

import { expect, test, type Page } from "@playwright/test";

// Flow 1 (User & Membership) nhìn từ Member: đăng ký bằng OTP → vào khu Member → chọn và mua Membership Gym →
// quay lại từ cổng thanh toán → gói hiệu lực → không mua trùng → lịch sử check-in. API mock, có trạng thái.
const userId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const memberPackageId = "33333333-3333-4333-8333-333333333333";
const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const world = { registered: false, paid: false, checkedIn: false };

const me = () => ({
  userId,
  email: "new.member@example.com",
  fullName: "New Member",
  role: "MEMBER",
  sportIds: [],
});
const pkg = () => ({
  memberPackageId,
  packageId: 1,
  packageName: "Gym monthly",
  startDate: isoDay(0),
  endDate: isoDay(30),
  status: "ACTIVE",
  isUsable: true,
  remainingSessions: null,
  sessionLimit: null,
  stackingApproved: false,
  stackingApprovalReason: null,
});
const checkout = () => ({
  invoiceId,
  checkoutSessionId: "44444444-4444-4444-8444-444444444444",
  beneficiaryUserId: userId,
  initiatorUserId: userId,
  kind: "MEMBERSHIP",
  state: world.paid ? "COMPLETED" : "ACTIVE",
  revision: 1,
  totalAmount: 500000,
  pointsApplied: 0,
  cashAmount: 500000,
  expiresAtUtc: new Date(Date.now() + 600_000).toISOString(),
  serverNowUtc: new Date().toISOString(),
  resourceHoldId: null,
  ptMemberPackageId: null,
  ptCoachId: null,
  ptFrequency: null,
  invoiceStatus: world.paid ? "PAID" : "ISSUED",
  fulfillmentOutcome: world.paid ? "FULFILLED" : "PENDING",
  reconciliationRequired: false,
});

async function install(page: Page) {
  Object.assign(world, { registered: false, paid: false, checkedIn: false });
  await page.addInitScript(() => localStorage.setItem("sporthub_lang", "en"));
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, json: body });
    if (request.method() === "POST")
      posts.push({ path, body: request.postDataJSON() });

    if (path === "/api/auth/register/otp")
      return route.fulfill({ status: 204 });
    if (path === "/api/auth/register") {
      world.registered = true;
      return json({ accessToken: "flow1-token", user: me() });
    }
    if (path === "/api/users/me") return json(me());
    if (path === "/api/membership-packages")
      return json([
        {
          packageId: 1,
          name: "Gym monthly",
          description: "Free Gym access for 30 days.",
          price: 500000,
          durationDays: 30,
          isActive: true,
        },
        {
          packageId: 2,
          name: "Gym quarterly",
          description: "Free Gym access for 90 days.",
          price: 1300000,
          durationDays: 90,
          isActive: true,
        },
      ]);
    if (path === "/api/members/me/packages")
      return json(world.paid ? [pkg()] : []);
    if (path === "/api/checkouts/membership") return json(checkout());
    if (path === `/api/checkouts/${invoiceId}`) return json(checkout());
    if (path === `/api/invoices/${invoiceId}`)
      return json({
        summary: {
          invoiceId,
          invoiceNumber: "INV-0001",
          memberName: "New Member",
          memberEmail: "new.member@example.com",
          totalAmount: 500000,
          pointsSpent: 0,
          cashAmount: world.paid ? 500000 : 0,
          outstanding: world.paid ? 0 : 500000,
          status: world.paid ? "PAID" : "ISSUED",
          fulfillmentOutcome: world.paid ? "FULFILLED" : "PENDING",
          reconciliationRequired: false,
          issuedAt: new Date().toISOString(),
        },
        items: [
          {
            itemId: "i1",
            description: "Gym monthly",
            quantity: 1,
            unitPrice: 500000,
            lineAmount: 500000,
          },
        ],
        payments: [],
        adjustments: [],
      });
    if (path === "/api/wallet/me")
      return json({ availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 });
    if (path === "/api/members/me/gym-checkins")
      return json({
        items: world.checkedIn
          ? [
              {
                checkInId: "c1",
                memberId: userId,
                checkInTime: new Date(Date.now() - 3_600_000).toISOString(),
                checkOutTime: null,
                checkedInByUserId: "r1",
                checkedOutByUserId: null,
              },
            ]
          : [],
        page: 1,
        pageSize: 10,
        totalCount: world.checkedIn ? 1 : 0,
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/members/me/schedule") return json([]);
    if (path === "/api/members/me/invoices")
      return json({ items: [], page: 1, pageSize: 5, totalCount: 0 });
    return json([]);
  });
  return posts;
}

test("a new member registers, buys a Gym membership, returns from payment and cannot buy the same package twice", async ({
  page,
}) => {
  const posts = await install(page);

  // 1. Đăng ký bằng OTP: gửi mã, nhập mã, hoàn tất bằng mật khẩu mạnh.
  await page.goto("/register");
  await page.getByLabel("Email").fill("new.member@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel(/verification code|6-digit/i).fill("123456");
  await page.getByRole("button", { name: /Continue to Step 2/ }).click();
  await page.getByLabel("Full name").fill("New Member");
  await page.getByLabel("Password", { exact: true }).fill("Strong-Pass-1!");
  await page.getByLabel("Confirm password").fill("Strong-Pass-1!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/member$/);
  expect(
    posts.find((p) => p.path === "/api/auth/register")?.body,
  ).toMatchObject({
    email: "new.member@example.com",
    otpCode: "123456",
    fullName: "New Member",
  });

  // 2. Hội viên mới chưa có gói: dashboard chỉ lối mua Membership, không giả vờ có quyền lợi.
  await expect(page.getByText("No Gym membership yet.")).toBeVisible();
  await page.getByRole("link", { name: "Choose a Gym membership" }).click();
  await expect(page).toHaveURL(/\/member\/services\?tab=gym$/);

  // 3. Chọn gói và tạo checkout.
  const monthly = page
    .locator("article, section, div")
    .filter({ hasText: "Gym monthly" });
  await expect(monthly.first()).toBeVisible();
  await page.getByRole("button", { name: "Review & checkout" }).first().click();
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect
    .poll(() => posts.some((p) => p.path === "/api/checkouts/membership"))
    .toBe(true);
  expect(
    posts.find((p) => p.path === "/api/checkouts/membership")?.body,
  ).toEqual({
    packageId: 1,
    allowStacking: false,
  });

  // 4. Quay lại từ cổng thanh toán: vẫn ở khu Member (có thanh điều hướng), thấy kết quả và lối đi tiếp.
  world.paid = true;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/payments/return?invoiceId=${invoiceId}`);
  const nav = page.getByRole("navigation", { name: "Member Navigation" });
  await expect(nav).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to my Gym membership" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to my Gym membership" }).click();
  await expect(page).toHaveURL(/\/member\/services\?tab=gym$/);

  // 5. Gói đã hiệu lực; mua lại đúng gói đó bị chặn kèm lý do, gói khác vẫn mua được.
  await expect(page.getByText("Gym monthly").first()).toBeVisible();
  await expect(page.getByText(/You already have this package/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & checkout" }),
  ).toHaveCount(1);

  // 6. Lễ tân check-in: Member thấy lượt vào của mình.
  world.checkedIn = true;
  await page.goto("/member/services?tab=visits");
  await expect(
    page.getByRole("table").or(page.getByRole("list")).first(),
  ).toBeVisible();
  await expect(page.getByText(/\d{2}\/\d{2}\/\d{4}/).first()).toBeVisible();
});

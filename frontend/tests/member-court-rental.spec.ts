import { test, expect, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";

/** Member đang hoạt động, không có Membership Gym, chuyên môn hay hồ sơ nào (BR-140). */
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const requests: { body: Record<string, unknown> }[] = [];
  const sport = {
    sportId: 3,
    code: "badminton",
    name: "Badminton",
    description: null,
    imageUrl: null,
    sortOrder: 2,
    isActive: true,
    services: [
      {
        serviceType: "GROUP_COURSE",
        isEnabled: true,
        defaultSessionMinutes: 90,
        defaultMaxCapacity: 12,
      },
      {
        serviceType: "COURT_RENTAL",
        isEnabled: true,
        defaultSessionMinutes: null,
        defaultMaxCapacity: null,
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: memberId,
          email: "member@example.com",
          fullName: "Hồ Lê Thiên An",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path === "/api/sports") {
      // Chỉ môn có dịch vụ thuê sân bật mới xuất hiện trong form đặt sân.
      expect(url.searchParams.get("service")).toBe("COURT_RENTAL");
      return route.fulfill({ json: [sport] });
    }
    if (path === "/api/court-rentals/policy")
      return route.fulfill({
        json: {
          slotMinutes: 60,
          maxHours: 4,
          advanceDays: 30,
          cancelFreeHours: 24,
          serverNowUtc: "2030-10-02T00:00:00Z",
        },
      });
    if (path === "/api/court-rentals/availability") {
      const start = url.searchParams.get("startUtc")!;
      const end = url.searchParams.get("endUtc")!;
      const hours = (Date.parse(end) - Date.parse(start)) / 3600000;
      return route.fulfill({
        json: [
          {
            roomId: 7,
            name: "Court A",
            capacity: 2,
            totalPrice: 100000 * hours,
            blocks: Array.from({ length: hours }, (_, i) => ({
              startUtc: new Date(Date.parse(start) + i * 3600000).toISOString(),
              endUtc: new Date(
                Date.parse(start) + (i + 1) * 3600000,
              ).toISOString(),
              price: 100000,
            })),
          },
        ],
      });
    }
    if (path === "/api/checkouts/court-rental") {
      requests.push({ body: route.request().postDataJSON() });
      return route.fulfill({
        status: 403,
        json: { error: "member_inactive", message: "Member account inactive" },
      });
    }
    if (path === "/api/wallet/me")
      return route.fulfill({
        json: { availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 },
      });
    return route.fulfill({ json: [] });
  });
  return requests;
}

test("any active member prices a 2-hour rental from the server and sends no owner, price or attendee count", async ({
  page,
}) => {
  const requests = await setup(page);
  await page.goto("/member/courts/book");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Book a court",
  );
  // Không còn số người, hồ sơ hay trạng thái duyệt.
  await expect(page.getByLabel(/attendees/i)).toHaveCount(0);
  await expect(page.getByText(/approved/i)).toHaveCount(0);

  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page.getByLabel("Date", { exact: true }).fill("2030-10-03");
  await page.getByLabel("Hours", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Check availability and price" })
    .click();
  await page.getByLabel("Room", { exact: true }).selectOption("7");

  // 2 giờ x 100.000 = 200.000: tổng do server báo, FE chỉ hiển thị.
  await expect(page.getByText(/200,000/).first()).toBeVisible();

  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(Object.keys(requests[0].body).sort()).toEqual([
    "endUtc",
    "roomId",
    "sportId",
    "startUtc",
  ]);
  expect(requests[0].body).toMatchObject({ sportId: 3, roomId: 7 });
});

test("legacy portal bookmarks land on the member routes", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/external-coach/book");
  await expect(page).toHaveURL(/\/member\/courts\/book$/);
  await page.goto("/external-coach/rentals");
  await expect(page).toHaveURL(/\/member\/rentals$/);
  await page.goto("/external-coach/wallet");
  await expect(page).toHaveURL(/\/member\/finance\?tab=wallet$/);
  // Trang đăng ký riêng cho Coach ngoài không còn: về trang đăng ký Member.
  await page.goto("/register-external-coach");
  await expect(page).toHaveURL(/\/register$/);
});

test("the member menu has a court rental entry that stays on one row at 1360px", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1360, height: 800 });
  await page.goto("/member");
  const nav = page.getByRole("navigation", { name: "Member Navigation" });
  await expect(nav.getByRole("link", { name: "Court rental" })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(8);
  const box = await page.evaluate(() => {
    const header = document.querySelector("header") as HTMLElement;
    const navEl = document.querySelector("header nav") as HTMLElement;
    return {
      header: header.getBoundingClientRect().height,
      overflow: navEl.scrollWidth > navEl.clientWidth,
      page: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(box.header).toBeLessThan(80);
  expect(box.overflow).toBe(false);
  expect(box.page).toBe(false);
});

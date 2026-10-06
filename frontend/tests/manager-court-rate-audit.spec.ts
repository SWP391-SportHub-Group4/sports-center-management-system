import { expect, test, type Page } from "@playwright/test";
import { loginApi, installBrowserSession } from "./helpers/auth";
import { bearer, liveApiBase } from "./helpers/api";

const base = {
  auditId: "court-audit",
  userId: "11111111-1111-4111-8111-111111111111",
  actorEmail: "manager@example.com",
  action: "UPDATE_COURT_RATE",
  targetEntity: "CourtRate",
  targetId: "1",
  timestamp: "2026-10-06T16:35:00Z",
};
const legacy = {
  roomTypeId: 1,
  sportId: null,
  days: "MON",
  price: 100000,
  active: true,
};
const full = {
  ...legacy,
  roomTypeName: "Badminton court",
  sportId: 2,
  sportName: "Badminton",
  startTimeLocal: "08:00",
  endTimeLocal: "10:00",
};
function entry(
  id: string,
  oldValue: unknown,
  newValue: unknown,
  action = base.action,
) {
  return {
    ...base,
    auditId: id,
    action,
    oldValue: oldValue === null ? null : JSON.stringify(oldValue),
    newValue: newValue === null ? null : JSON.stringify(newValue),
  };
}
async function setup(
  page: Page,
  rows: object[],
  language = "en",
  roomStatus = 200,
) {
  const requests: string[] = [];
  await page.addInitScript((lang) => {
    localStorage.setItem("sporthub.accessToken", "fixture");
    localStorage.setItem("sporthub_lang", lang);
  }, language);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: base.userId,
          email: base.actorEmail,
          fullName: "Manager",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/audit-logs")
      return route.fulfill({
        json: { items: rows, totalCount: rows.length, page: 1, pageSize: 25 },
      });
    if (path === "/api/room-types")
      return route.fulfill({
        status: roomStatus,
        json:
          roomStatus === 200
            ? [
                { roomTypeId: 1, name: "Current court name", sportIds: [2] },
                { roomTypeId: 3, name: "Current tennis court", sportIds: [2] },
              ]
            : { code: "reference_unavailable", message: "Unavailable" },
      });
    if (path === "/api/sports" || path.includes("notifications"))
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "fixture_missing" } });
  });
  return requests;
}

test("legacy court price change uses current room names without inventing historical times or prices", async ({
  page,
}) => {
  const requests = await setup(
    page,
    [
      entry(
        "price",
        { ...legacy, password: "SECRET" },
        { ...legacy, price: 200000 },
      ),
    ],
    "vi",
  );
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("Bảng giá thuê sân: Current court name");
  await expect(table).not.toContainText("Mã bảng giá:");
  await expect(table).toContainText("Giá mỗi giờ:");
  await expect(table.locator("del")).toHaveText("100,000 ₫");
  await expect(table).toContainText("200,000 ₫");
  await expect(table).toContainText("Loại phòng/sân: Current court name");
  await expect(table).toContainText("Tất cả môn tương thích");
  await expect(table).not.toContainText("Trạng thái:");
  await expect(table).not.toContainText("Khung giờ:");
  await expect(table).not.toContainText("Ngày áp dụng:");
  await expect(page.getByText("SECRET")).toHaveCount(0);
  expect(requests).not.toContain("/api/manager/court-rates");
  expect(requests.filter((path) => path === "/api/room-types")).toHaveLength(1);
  await expect(
    page.getByText(
      "Log cũ chưa ghi tên loại phòng/sân sẽ hiển thị tên trong danh mục hiện tại.",
    ),
  ).toBeVisible();
});

test("time/day/reference updates use historical names and human labels", async ({
  page,
}) => {
  const requests = await setup(page, [
    entry("multi", full, {
      ...full,
      roomTypeId: 3,
      roomTypeName: "Tennis court",
      sportId: null,
      sportName: null,
      days: "WED,MON",
      startTimeLocal: "09:00",
      endTimeLocal: "11:00",
    }),
  ]);
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table.locator("del")).toHaveText([
    "Badminton court",
    "Badminton (#2)",
    "Monday",
    "08:00–10:00",
  ]);
  await expect(table).toContainText("Court rate: Tennis court");
  await expect(table).toContainText("All compatible sports");
  await expect(table).toContainText("Monday, Wednesday");
  await expect(table).toContainText("09:00–11:00");
  await expect(table).not.toContainText("Price per hour:");
  await expect(table).not.toContainText("Status:");
  await expect(table).not.toContainText("Current tennis court");
  expect(requests).not.toContain("/api/room-types");
});

test("legacy room changes resolve both references with one shared request", async ({
  page,
}) => {
  const requests = await setup(page, [
    entry("room-change", legacy, { ...legacy, roomTypeId: 3 }),
    entry("second", legacy, { ...legacy, price: 150000 }),
  ]);
  await page.goto("/manager/audit-log");
  const changed = page
    .getByRole("row")
    .filter({ hasText: "Current tennis court" });
  await expect(changed.locator("del")).toHaveText("Current court name");
  await expect(changed).toContainText("Room type:");
  await expect(changed).toContainText("Court rate: Current tennis court");
  await expect(page.getByRole("table")).toContainText("150,000 ₫");
  expect(requests.filter((path) => path === "/api/room-types")).toHaveLength(1);
});

test("reference failure keeps audit prices visible and retry recovers names; missing references keep IDs", async ({
  page,
}) => {
  await setup(
    page,
    [
      entry("price", legacy, { ...legacy, price: 200000 }),
      entry(
        "missing",
        { ...legacy, roomTypeId: 999 },
        { ...legacy, roomTypeId: 999, price: 150000 },
      ),
    ],
    "en",
    503,
  );
  await page.goto("/manager/audit-log");
  await expect(page.getByRole("status")).toContainText(
    "Room type names could not be loaded.",
  );
  await expect(page.getByRole("table")).toContainText("200,000 ₫");
  await expect(page.getByRole("table")).toContainText("Room type: #1");
  await page.route("**/api/room-types", (route) =>
    route.fulfill({
      json: [{ roomTypeId: 1, name: "Recovered court name", sportIds: [] }],
    }),
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("table")).toContainText(
    "Court rate: Recovered court name",
  );
  await expect(page.getByRole("table")).toContainText("Room type: #999");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("creation/deletion show snapshots and status-only update hides unchanged price/day/window", async ({
  page,
}) => {
  await setup(page, [
    entry("create", null, full, "CREATE_COURT_RATE"),
    entry("status", full, { ...full, active: false }),
    entry("delete", full, null, "DELETE_COURT_RATE"),
  ]);
  await page.goto("/manager/audit-log");
  for (const action of ["CREATE_COURT_RATE", "DELETE_COURT_RATE"]) {
    const row = page.getByRole("row").filter({ hasText: action });
    await expect(row).toContainText("Price per hour: 100,000 ₫");
    await expect(row).toContainText("Time window: 08:00–10:00");
    await expect(row).toContainText("Applicable days: Monday");
    await expect(row.locator("del")).toHaveCount(0);
  }
  const status = page.getByRole("row").filter({ hasText: "UPDATE_COURT_RATE" });
  await expect(status.locator("del")).toHaveText("Active");
  await expect(status).toContainText("Inactive");
  await expect(status).not.toContainText("Price per hour:");
  await expect(status).not.toContainText("Time window:");
  await expect(status).not.toContainText("Applicable days:");
});

test("partial, malformed and unchanged snapshots have truthful fallback without secrets", async ({
  page,
}) => {
  await setup(page, [
    {
      ...entry("broken", null, null),
      oldValue: "{broken",
      newValue: JSON.stringify({
        price: { secret: "SECRET" },
        days: "INVALID",
        emailBody: "PRIVATE",
      }),
    },
    entry(
      "partial",
      { ...legacy },
      { ...full, sportId: null, sportName: null },
    ),
    entry(
      "same",
      { ...full, days: "MON,WED" },
      { ...full, days: "WED,MON,MON" },
    ),
    entry(
      "wrapped",
      { value: legacy },
      { value: { ...legacy, price: 250000 } },
    ),
  ]);
  await page.goto("/manager/audit-log");
  const table = page.getByRole("table");
  await expect(table).toContainText("No operation details were recorded.");
  await expect(table).toContainText("No changes in the recorded fields.");
  const partial = page.getByRole("row").filter({ hasText: "08:00–10:00" });
  await expect(partial.locator("del")).toHaveText("Not recorded");
  await expect(table).toContainText("250,000 ₫");
  await expect(page.getByText(/SECRET|PRIVATE|broken/)).toHaveCount(0);
});

test("court metadata stays readable on mobile and switches language", async ({
  page,
}) => {
  await setup(page, [
    entry("responsive", full, {
      ...full,
      days: "MON,TUE,WED,THU,FRI,SAT,SUN",
      price: 200000,
      startTimeLocal: "09:00",
      endTimeLocal: "11:00",
    }),
  ]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/manager/audit-log");
    await expect(page.getByRole("table")).toContainText("200,000 ₫");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "../output/manager-court-rate-audit-mobile.png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Giá mỗi giờ:");
  await expect(page.getByRole("table")).toContainText("Thứ hai");
});

test("live existing court rate changes render recorded fields after reload", async ({
  page,
  request,
}) => {
  test.skip(!liveApiBase, "Set P2_LIVE_API for read-only live verification");
  const login = await loginApi(request, "manager@sporthub.vn");
  const response = await request.get(
    liveApiBase +
      "/api/audit-logs?targetEntity=CourtRate&action=UPDATE_COURT_RATE&page=1&pageSize=25&sortBy=timestamp&sortDirection=desc",
    { headers: bearer(login.accessToken) },
  );
  expect(response.ok()).toBe(true);
  const logs = await response.json();
  const sample = logs.items.find(
    (row: { oldValue: string; newValue: string }) => {
      try {
        const old = JSON.parse(row.oldValue);
        const next = JSON.parse(row.newValue);
        return (
          old.price !== next.price &&
          typeof old.price === "number" &&
          typeof next.price === "number"
        );
      } catch {
        return false;
      }
    },
  );
  expect(sample, "Existing price-change event").toBeTruthy();
  const old = JSON.parse(sample.oldValue),
    next = JSON.parse(sample.newValue);
  const roomResponse = await request.get(liveApiBase + "/api/room-types", {
    headers: bearer(login.accessToken),
  });
  expect(roomResponse.ok()).toBe(true);
  const roomTypes = await roomResponse.json();
  const roomName =
    next.roomTypeName ??
    roomTypes.find(
      (type: { roomTypeId: number }) => type.roomTypeId === next.roomTypeId,
    )?.name;
  expect(roomName, "Existing room type name").toBeTruthy();
  const money = (amount: number) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(
      amount,
    ) + " ₫";
  await installBrowserSession(page, login.accessToken);
  await page.goto(
    "/manager/audit-log?targetEntity=CourtRate&action=UPDATE_COURT_RATE",
  );
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    const table = page.getByRole("table");
    await expect(table).toContainText(money(old.price));
    await expect(table).toContainText(money(next.price));
    await expect(table).toContainText("Price per hour:");
    await expect(table).toContainText("Court rate: " + roomName);
    await expect(table).toContainText("Room type: " + roomName);
  }
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.screenshot({
    path: "../output/manager-court-rate-audit-live.png",
    fullPage: true,
  });
});

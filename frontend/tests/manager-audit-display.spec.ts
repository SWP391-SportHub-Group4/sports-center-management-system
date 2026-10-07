import { test, expect, type Page } from "@playwright/test";

const actor = "11111111-1111-4111-8111-111111111111";
function entry(
  id: string,
  entity: string,
  action: string,
  before: unknown,
  after: unknown,
  extra: object = {},
) {
  return {
    auditId: id,
    userId: actor,
    actorEmail: "manager@example.com",
    targetEntity: entity,
    targetId: id,
    action,
    timestamp: "2026-10-07T13:11:00Z",
    oldValue: before === null ? null : JSON.stringify(before),
    newValue: after === null ? null : JSON.stringify(after),
    ...extra,
  };
}
async function setup(page: Page, rows: object[], language = "en") {
  await page.addInitScript((lang) => {
    localStorage.setItem("sporthub.accessToken", "fixture");
    localStorage.setItem("sporthub_lang", lang);
  }, language);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: actor,
          email: "manager@example.com",
          fullName: "Manager",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/audit-logs")
      return route.fulfill({
        json: { items: rows, totalCount: rows.length, page: 1, pageSize: 25 },
      });
    if (path === "/api/sports" || path.includes("notifications"))
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { code: "fixture_missing" } });
  });
  await page.goto("/manager/audit-log");
}

test("only resolved targets link to supported Manager detail pages", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "1",
      "Class",
      "UPDATE_CLASS",
      { name: "Old class" },
      { name: "Current class" },
      { currentTargetLabel: "Current class" },
    ),
    entry(
      "7",
      "Room",
      "UPDATE_ROOM",
      null,
      { name: "Court A" },
      { currentTargetLabel: "Court A" },
    ),
    entry("99", "Class", "DELETE_CLASS", { name: "Deleted class" }, null),
  ]);
  const table = page.getByRole("table");
  await expect(
    table.getByRole("link", { name: "Class · Current class", exact: true }),
  ).toHaveAttribute("href", "/manager/classes/1");
  await expect(
    table.getByRole("link", { name: "Room/court · Court A", exact: true }),
  ).toHaveAttribute("href", "/manager/facilities/7");
  await expect(table.getByRole("link", { name: /Deleted class/ })).toHaveCount(
    0,
  );
});

test("legacy activity logs identify the sport and show localized before/after status", async ({
  page,
}) => {
  await setup(
    page,
    [
      entry(
        "4",
        "Sport",
        "DEACTIVATE_SPORT",
        { isActive: true },
        { isActive: false },
        { currentTargetLabel: "Bóng rổ" },
      ),
    ],
    "vi",
  );
  const table = page.getByRole("table");
  await expect(table).toContainText("Môn thể thao · Bóng rổ");
  await expect(table).toContainText("Tên hiện tại");
  await expect(table).toContainText("ID: 4");
  await expect(table).toContainText("Trạng thái:");
  await expect(table.locator("del")).toHaveText("Đang hoạt động");
  await expect(table).toContainText("Ngừng hoạt động");
  await expect(table).not.toContainText("isActive");
});

test("recorded identity wins over current names; deleted and malformed snapshots keep honest fallbacks", async ({
  page,
}) => {
  const rows = [
    entry(
      "rename",
      "Sport",
      "UPDATE_SPORT",
      { name: "Old name" },
      { name: "Event name" },
      { currentTargetLabel: "Today's name" },
    ),
    entry(
      "deleted",
      "RoomType",
      "DELETE_ROOM_TYPE",
      { name: "Deleted court type" },
      null,
    ),
    entry(
      "broken",
      "Sport",
      "UPDATE_SPORT",
      { name: "Surviving old name" },
      null,
      { newValue: "broken-json" },
    ),
    entry("missing", "Sport", "DEACTIVATE_SPORT", null, { isActive: false }),
    entry("future", "UnknownType", "UNKNOWN", null, {
      password: "SECRET",
      token: "TOKEN",
    }),
  ];
  await setup(page, rows);
  const table = page.getByRole("table");
  await expect(table).toContainText("Sport · Event name");
  await expect(table).not.toContainText("Today's name");
  await expect(table).toContainText("Room type · Deleted court type");
  await expect(table).toContainText("Sport · Surviving old name");
  await expect(table).toContainText("Name not recorded or no longer available");
  await expect(table).toContainText("No operation details were recorded.");
  await expect(table).not.toContainText("SECRET");
  await expect(table).not.toContainText("TOKEN");
  await expect(table).not.toContainText("broken-json");
});

test("sport service changes include previously hidden duration/capacity with legacy PascalCase support", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "sport",
      "Sport",
      "UPDATE_SPORT",
      {
        name: "Badminton",
        services: [
          { ServiceType: 1, IsEnabled: true, DefaultSessionMinutes: 90 },
        ],
        password: "SECRET",
      },
      {
        name: "Badminton",
        services: [
          {
            serviceType: "GroupCourse",
            isEnabled: true,
            defaultSessionMinutes: 60,
            defaultMaxCapacity: 18,
          },
        ],
        arbitrary: { name: "HIDDEN" },
      },
    ),
  ]);
  const table = page.getByRole("table");
  await expect(table).toContainText(
    "Group course · Session duration (minutes):",
  );
  await expect(table).toContainText("Group course · Default capacity:");
  await expect(table.locator("del")).toHaveText(["90", "Not recorded"]);
  await expect(table).not.toContainText("Service status:");
  await expect(table).not.toContainText("SECRET");
  await expect(table).not.toContainText("HIDDEN");
});

test("legacy array payloads show hours and named sport links and fit mobile", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "hours",
      "Room",
      "SET_ROOM_OPENING_HOURS",
      ["1:06:00-22:00", "2:06:00-22:00"],
      ["1:08:00-20:00"],
      { currentTargetLabel: "Court A" },
    ),
    entry("links", "RoomType", "SET_ROOM_TYPE_SPORTS", [1, 2], [2], {
      currentTargetLabel: "Court type",
      referenceNames: { "Sport:1": "Gym", "Sport:2": "Badminton" },
    }),
  ]);
  const table = page.getByRole("table");
  await expect(table).toContainText("Opening hours · Monday:");
  await expect(table).toContainText("08:00-20:00");
  await expect(table).toContainText("Closed");
  await expect(table).toContainText("Gym, Badminton");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toContainText("Room/court · Court A");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("class and manager workflows show referenced names, monetary changes, wrapped reasons and notification subjects", async ({
  page,
}) => {
  const coach = "22222222-2222-4222-8222-222222222222";
  await setup(page, [
    entry(
      "class",
      "Class",
      "UPDATE_CLASS",
      { price: 300000, coachId: coach, roomId: 1 },
      {
        value: { price: 400000, coachId: coach, roomId: 2 },
        reason: "Move to larger court",
      },
      {
        currentTargetLabel: "C01 · Beginner class",
        referenceNames: {
          [`UserAccount:${coach}`]: "Coach An",
          "Room:1": "Court A",
          "Room:2": "Court B",
        },
      },
    ),
    entry("notice", "Notification", "SEND_MANUAL_NOTICE", null, {
      subject: "New opening hours",
      recipientCount: 12,
      SendInApp: true,
      SendEmail: false,
      requestFingerprint: "PRIVATE",
    }),
    entry(
      "settings",
      "SystemSetting",
      "UPDATE_SYSTEM_SETTING",
      { value: "3" },
      { value: "5" },
      { targetId: "class.threshold_days_before_start" },
    ),
  ]);
  const table = page.getByRole("table");
  await expect(table).toContainText("Class · C01 · Beginner class");
  await expect(table).toContainText("Court A");
  await expect(table).toContainText("Court B");
  await expect(table).toContainText("400,000 ₫");
  await expect(table).toContainText("Reason:");
  await expect(table).toContainText("Move to larger court");
  await expect(table).toContainText("Notification · New opening hours");
  await expect(table).toContainText("Recipients: 12");
  await expect(table).not.toContainText("PRIVATE");
  await expect(table).toContainText("Setting value:");
  await expect(table).toContainText(
    "System setting · class.threshold_days_before_start",
  );
});

test("reference changes resolve both coaches and retain missing IDs without inventing a name", async ({
  page,
}) => {
  const old = "22222222-2222-4222-8222-222222222222",
    next = "33333333-3333-4333-8333-333333333333";
  await setup(page, [
    entry(
      "pt",
      "PtCoachChangeRequest",
      "APPROVE_PT_COACH_CHANGE_REQUEST",
      { coachId: old },
      { coachId: next, movedSessionIds: [], unmovedSessionIds: [] },
      {
        currentTargetLabel: "Member Nguyen",
        referenceNames: {
          [`UserAccount:${old}`]: "Coach An",
          [`UserAccount:${next}`]: "Coach Binh",
        },
      },
    ),
    entry("block", "RoomBlock", "DELETE_ROOM_BLOCK", { roomId: 9 }, null, {
      referenceNames: { "Room:9": "Legacy court" },
    }),
  ]);
  const table = page.getByRole("table");
  await expect(table).toContainText("PT coach change request · Member Nguyen");
  await expect(table).toContainText("Coach An");
  await expect(table).toContainText("Coach Binh");
  await expect(table).not.toContainText(old);
  await expect(table).not.toContainText(next);
  await expect(table).toContainText("Room block · Legacy court");
  await expect(
    table.locator("p").filter({ hasText: "Sessions moved:" }),
  ).toContainText("None");
});

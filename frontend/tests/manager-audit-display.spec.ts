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

const auditTable = (page: Page) =>
  page.getByRole("table", { name: "Audit log", exact: true });
async function openEvent(page: Page, index = 0) {
  await auditTable(page)
    .getByRole("button", { name: /View details:/ })
    .nth(index)
    .click();
  return page.getByRole("dialog");
}

test("affected records show types and each event opens its own details", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "1",
      "Class",
      "UPDATE_CLASS",
      { name: "Old class" },
      { name: "Current class" },
    ),
    entry("7", "Room", "UPDATE_ROOM", null, { name: "Court A" }),
    entry("99", "Class", "DELETE_CLASS", { name: "Deleted class" }, null),
  ]);
  const table = auditTable(page);
  await expect(table.locator('[data-label="Action"]')).toHaveText([
    "UPDATE_CLASS",
    "UPDATE_ROOM",
    "DELETE_CLASS",
  ]);
  await expect(
    table.getByRole("button", { name: /View details:/ }),
  ).toHaveCount(3);
  await expect(table.locator('[data-label="Target"]')).toHaveText([
    "Class",
    "Room/court",
    "Class",
  ]);
  await expect(table.getByRole("link")).toHaveCount(0);
  await expect(
    page.getByLabel("Role at event time").locator('option[value=""]'),
  ).toHaveText("All");
  const dialog = await openEvent(page);
  await expect(dialog).toContainText("Old class");
  await expect(dialog).toContainText("Current class");
});

test("legacy status changes appear in the popup in English", async ({
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
        { currentTargetLabel: "Basketball" },
      ),
    ],
    "vi",
  );
  await expect(auditTable(page)).not.toContainText("Current name");
  const dialog = await openEvent(page);
  await expect(dialog).toContainText("Active");
  await expect(dialog).toContainText("Inactive");
  await expect(dialog).not.toContainText("isActive");
});

test("historical identities remain readable and malformed snapshots expose no raw payload", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "rename",
      "Sport",
      "UPDATE_SPORT",
      { name: "Old name" },
      { name: "Event name" },
      { currentTargetLabel: "Today's name" },
    ),
    entry(
      "broken",
      "Sport",
      "UPDATE_SPORT",
      { name: "Surviving old name" },
      null,
      { newValue: "broken-json" },
    ),
    entry("future", "UnknownType", "UNKNOWN", null, {
      password: "SECRET",
      token: "TOKEN",
    }),
  ]);
  let dialog = await openEvent(page);
  await expect(dialog).toContainText("Event name");
  await expect(dialog).not.toContainText("Today's name");
  await page.keyboard.press("Escape");
  dialog = await openEvent(page, 1);
  await expect(dialog).toContainText("Surviving old name");
  await expect(dialog).not.toContainText("broken-json");
  await page.keyboard.press("Escape");
  dialog = await openEvent(page, 2);
  await expect(dialog).not.toContainText(/SECRET|TOKEN/);
});

test("sport service changes preserve legacy duration and capacity values", async ({
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
  const dialog = await openEvent(page);
  await expect(dialog).toContainText("Session duration");
  await expect(dialog).toContainText("Default capacity");
  await expect(dialog).toContainText("90");
  await expect(dialog).toContainText("60");
  await expect(dialog).not.toContainText(/SECRET|HIDDEN/);
});

test("opening hours and sport references are available in mobile event details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, [
    entry(
      "hours",
      "Room",
      "SET_ROOM_OPENING_HOURS",
      ["1:06:00-22:00", "2:06:00-22:00"],
      ["1:08:00-20:00"],
    ),
    entry("links", "RoomType", "SET_ROOM_TYPE_SPORTS", [1, 2], [2], {
      referenceNames: { "Sport:1": "Gym", "Sport:2": "Badminton" },
    }),
  ]);
  let dialog = await openEvent(page);
  await expect(dialog).toContainText("08:00");
  await expect(dialog).toContainText("Monday");
  await page.keyboard.press("Escape");
  dialog = await openEvent(page, 1);
  await expect(dialog).toContainText("Gym");
  await expect(dialog).toContainText("Badminton");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("class changes, reasons and notification details are retained behind View details", async ({
  page,
}) => {
  await setup(page, [
    entry(
      "class",
      "Class",
      "UPDATE_CLASS",
      { price: 300000, roomId: 1 },
      { value: { price: 400000, roomId: 2 }, reason: "Move to larger court" },
      { referenceNames: { "Room:1": "Court A", "Room:2": "Court B" } },
    ),
    entry("notice", "Notification", "SEND_MANUAL_NOTICE", null, {
      subject: "New opening hours",
      recipientCount: 12,
      SendInApp: true,
      SendEmail: false,
      requestFingerprint: "PRIVATE",
    }),
  ]);
  let dialog = await openEvent(page);
  await expect(dialog).toContainText("Court A");
  await expect(dialog).toContainText("Court B");
  await expect(dialog).toContainText("400,000");
  await expect(dialog).toContainText("Move to larger court");
  await page.keyboard.press("Escape");
  dialog = await openEvent(page, 1);
  await expect(dialog).toContainText("New opening hours");
  await expect(dialog).toContainText("12");
  await expect(dialog).not.toContainText("PRIVATE");
});

test("reference changes show names without exposing UUIDs", async ({
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
        referenceNames: {
          [`UserAccount:${old}`]: "Coach An",
          [`UserAccount:${next}`]: "Coach Binh",
        },
      },
    ),
  ]);
  const dialog = await openEvent(page);
  await expect(dialog).toContainText("Coach An");
  await expect(dialog).toContainText("Coach Binh");
  await expect(dialog).not.toContainText(old);
  await expect(dialog).not.toContainText(next);
});

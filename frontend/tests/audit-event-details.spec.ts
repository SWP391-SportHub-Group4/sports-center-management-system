import { expect, test, type Page } from "@playwright/test";
import { auditEventModel } from "../src/features/administration/audit-event-model";
import { en } from "../src/locales/en";
import type { AuditLogDto } from "../src/lib/types";

const uuid = "db3d195a-043e-4585-afd7-e2f256816950";
const base = {
  userId: uuid,
  actorEmail: "manager@example.com",
  actorFullName: "Tran Thu",
  actorRole: "CENTER_MANAGER",
  timestamp: "2026-10-13T07:21:00Z",
  ipAddress: "127.0.0.1",
};
function event(
  auditId: string,
  targetEntity: string,
  action: string,
  before: unknown,
  after: unknown,
  extra = {},
) {
  return {
    ...base,
    auditId,
    targetEntity,
    targetId: uuid,
    action,
    oldValue: before == null ? null : JSON.stringify(before),
    newValue: after == null ? null : JSON.stringify(after),
    ...extra,
  };
}
const sport = event(
  "sport",
  "Sport",
  "CREATE_SPORT",
  null,
  {
    name: "Test sport",
    code: "t001",
    imageUrl: null,
    description: null,
    isActive: true,
    sortOrder: 4,
    services: [
      {
        serviceType: "GroupCourse",
        isEnabled: true,
        defaultSessionMinutes: 90,
        defaultMaxCapacity: 12,
      },
    ],
    password: "SECRET",
    body: "SECRET_BODY",
  },
  { currentTargetLabel: "Changed today" },
);
const price = event(
  "price",
  "MembershipPackage",
  "UPDATE_MEMBERSHIP_PACKAGE",
  { name: "One day", price: 50000, durationDays: 1, isActive: true },
  { name: "One day", price: 60000, durationDays: 1, isActive: true },
);
async function setup(page: Page, rows: object[], manager = true) {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture"),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: uuid,
          email: base.actorEmail,
          fullName: base.actorFullName,
          role: manager ? "CENTER_MANAGER" : "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (path === "/api/audit-logs")
      return route.fulfill({
        json: { items: rows, totalCount: rows.length, page: 1, pageSize: 25 },
      });
    if (path.endsWith("/unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [{ roomTypeId: 1, name: "Current court" }],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto(manager ? "/manager/audit-log" : "/admin/audit-log");
  await expect(
    page.getByRole("table", { name: "Audit log", exact: true }),
  ).toBeVisible();
}
for (const manager of [false, true]) {
  test(`${manager ? "Manager" : "Admin"} has compact summaries and full creation details`, async ({
    page,
  }) => {
    await setup(page, [sport], manager);
    const table = page.getByRole("table", { name: "Audit log", exact: true });
    await expect(
      table.getByRole("button", { name: /View details:/ }),
    ).toHaveCount(1);
    await expect(table.locator('[data-label="Target"]')).toHaveText("Sport");
    await expect(table).not.toContainText(/Current name|None|SECRET|db3d195a/);
    await expect(table).not.toContainText("Test sport");
    await expect(table.locator("thead th").last()).toHaveText("");
    await expect(table.locator('tbody td[data-label=""]')).toHaveText(
      "View details",
    );
    const open = table.getByRole("button", { name: /View details:/ });
    await open.click();
    const dialog = page.getByRole("dialog");
    const values = dialog.getByRole("table", { name: "Recorded event values" });
    await expect(
      values.getByRole("columnheader", { name: "Value", exact: true }),
    ).toBeVisible();
    if (manager) {
      await expect(values.locator("tbody th")).toHaveText(["Code", "Name"]);
    } else {
      await expect(values).toContainText("90");
      await expect(values).toContainText("12");
    }
    await expect(dialog).not.toContainText(/SECRET|db3d195a|Current name/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });
}
test("update popup shows only changed historical values", async ({ page }) => {
  await setup(page, [price]);
  await page.getByRole("button", { name: /View details:/ }).click();
  const values = page.getByRole("dialog").getByRole("table");
  await expect(
    values.getByRole("columnheader", { name: "Before", exact: true }),
  ).toBeVisible();
  await expect(
    values.getByRole("columnheader", { name: "After", exact: true }),
  ).toBeVisible();
  await expect(values.locator("tbody tr")).toHaveCount(1);
  await expect(values).toContainText("50,000");
  await expect(values).toContainText("60,000");
  await expect(values).not.toContainText(/Duration|Status/);
});
test("cleared values remain explicit and reason is prioritized", async ({
  page,
}) => {
  await setup(page, [
    event(
      "removed",
      "Sport",
      "UPDATE_SPORT",
      { name: "Test", description: "Old description" },
      {
        value: { name: "Test", description: null },
        reason: "Remove outdated description",
      },
    ),
  ]);
  await page.getByRole("button", { name: /View details:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Remove outdated description");
  await expect(dialog.getByRole("table")).toContainText("Old description");
  await expect(dialog.getByRole("table")).toContainText("Removed");
});
test("report codes and column names become readable labels", async ({
  page,
}) => {
  await setup(page, [
    event("report", "ReportExport", "CREATE_REPORT_EXPORT", null, {
      reportType: "REVENUE_DIMENSIONS",
      format: "Pdf",
      fromDate: "2026-10-01",
      toDate: "2026-10-12",
      columns: ["collectedAmount", "memberName", "pointsRedeemed"],
      memberId: null,
    }),
  ]);
  await page.getByRole("button", { name: /View details:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Collected amount");
  await expect(dialog).toContainText("Member name");
  await expect(dialog).toContainText("PDF");
  await expect(dialog).not.toContainText(/REVENUE_DIMENSIONS|collectedAmount/);
});
test("unresolved references expose no UUIDs", async ({ page }) => {
  await setup(page, [
    event(
      "coach",
      "Class",
      "UPDATE_CLASS",
      { coachId: uuid },
      { coachId: "29224869-bfb5-491b-91d3-c48076006c6e" },
    ),
  ]);
  await page.getByRole("button", { name: /View details:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Unavailable");
  await expect(page.getByRole("dialog")).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
});
test("court rates retain recorded names and historical times and prices", async ({
  page,
}) => {
  const old = {
    roomTypeId: 1,
    roomTypeName: "Historical court",
    sportId: null,
    days: "MON,WED",
    startTimeLocal: "08:00",
    endTimeLocal: "12:00",
    price: 100000,
  };
  await setup(page, [
    event("court", "CourtRate", "UPDATE_COURT_RATE", old, {
      ...old,
      price: 150000,
      startTimeLocal: "09:00",
    }),
  ]);
  await page.getByRole("button", { name: /View details:/ }).click();
  const values = page.getByRole("dialog").getByRole("table");
  await expect(values).toContainText("Price per hour");
  await expect(values).toContainText("100,000");
  await expect(values).toContainText("150,000");
  await expect(values).toContainText("08:00");
  await expect(values).toContainText("09:00");
  await expect(values).not.toContainText("Current court");
});
test("deletion preserves recorded values", async ({ page }) => {
  await setup(page, [
    event(
      "delete",
      "Sport",
      "DELETE_SPORT",
      { name: "Removed sport", code: "s001" },
      null,
    ),
  ]);
  await page.getByRole("button", { name: /View details:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Record deleted");
  await expect(page.getByRole("dialog").getByRole("table")).toContainText(
    "s001",
  );
});
test("compact summaries and popup fit desktop and mobile", async ({ page }) => {
  await setup(page, [sport, price], true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `../output/audit-compact-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: /View details:/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").locator("tbody th")).toHaveText([
      "Code",
      "Name",
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole("dialog")
        .locator("tbody th")
        .evaluateAll((cells) =>
          cells.every((cell) => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            return (
              range.getBoundingClientRect().right <=
              cell.getBoundingClientRect().right
            );
          }),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `../output/audit-event-popup-${width}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
  }
});

test("Manager detail fields follow the requested action-specific rules", () => {
  const model = (
    action: string,
    target: string,
    before: unknown,
    after: unknown,
    extra = {},
  ) =>
    auditEventModel(
      event("policy", target, action, before, after, extra) as AuditLogDto,
      en,
      [],
      true,
    );
  const keys = (m: ReturnType<typeof model>) => m.fields.map((f) => f.key);
  expect(
    keys(
      model("FRONT_DESK_CREATE_MEMBER", "UserAccount", null, {
        email: "member@example.com",
        role: "Member",
      }),
    ),
  ).toEqual(["email"]);
  const specialties = model(
    "UPDATE_COACH_SPECIALTIES",
    "UserAccount",
    { sportIds: [1, 2], fullName: "Before" },
    { sportIds: [2, 3], fullName: "After", phone: "123" },
    {
      referenceNames: {
        "Sport:1": "Gym",
        "Sport:2": "Badminton",
        "Sport:3": "Basketball",
      },
    },
  );
  expect(keys(specialties)).toEqual(["sportIds"]);
  expect(specialties.comparison).toBe(false);
  expect(specialties.fields[0].value).toBe("Basketball");
  const sportBefore = {
    code: "badminton",
    name: "Badminton",
    isActive: false,
    sortOrder: 1,
  };
  const sportAfter = { ...sportBefore, isActive: true, sortOrder: 2 };
  for (const action of ["CREATE_SPORT", "ACTIVATE_SPORT", "DEACTIVATE_SPORT"]) {
    const m = model(
      action,
      "Sport",
      action === "CREATE_SPORT" ? null : sportBefore,
      sportAfter,
    );
    expect(keys(m)).toEqual(["code", "name"]);
    expect(m.fields.map((f) => f.value)).toEqual(["badminton", "Badminton"]);
  }
  expect(
    keys(
      model("UPDATE_SPORT", "Sport", sportBefore, {
        ...sportBefore,
        description: "Updated description",
      }),
    ),
  ).toEqual(["description"]);
  for (const action of ["ENABLE_SPORT_SERVICE", "DISABLE_SPORT_SERVICE"]) {
    const m = model(
      action,
      "SportServiceOffering",
      { sportId: 2, enabled: false },
      { sportId: 2, enabled: true, serviceType: "GroupCourse" },
      { referenceNames: { "Sport:2": "Badminton" } },
    );
    expect(keys(m)).toEqual(["sportId"]);
    expect(m.fields[0].value).toBe("Badminton");
  }
  const room = {
    name: "Court A",
    capacity: 10,
    roomTypeId: 3,
    sportId: 2,
    isActive: true,
  };
  for (const action of ["CREATE_ROOM", "UPDATE_ROOM", "DELETE_ROOM"]) {
    const m = model(
      action,
      "Room",
      action === "CREATE_ROOM" ? null : room,
      action === "DELETE_ROOM" ? null : { ...room, capacity: 12 },
    );
    expect(keys(m)).not.toContain("roomTypeId");
    expect(keys(m)).not.toContain("sportId");
    expect(keys(m)).toContain("capacity");
  }
  const rate = {
    roomId: 4,
    roomTypeId: 3,
    roomTypeName: "Indoor",
    sportId: 2,
    sportName: "Badminton",
    days: "MON",
    startTimeLocal: "08:00",
    endTimeLocal: "12:00",
    price: 100000,
    active: true,
  };
  for (const action of ["CREATE_COURT_RATE", "DELETE_COURT_RATE"]) {
    const m = model(
      action,
      "CourtRate",
      action === "DELETE_COURT_RATE" ? rate : null,
      action === "CREATE_COURT_RATE" ? rate : null,
    );
    expect(keys(m)).toEqual([
      "roomId",
      "days",
      "timeWindow",
      "price",
      "active",
    ]);
    expect(m.fields.find((f) => f.key === "timeWindow")?.value).toContain(
      "08:00",
    );
    expect(m.fields.find((f) => f.key === "timeWindow")?.value).toContain(
      "12:00",
    );
  }
  const changedRate = model("UPDATE_COURT_RATE", "CourtRate", rate, {
    ...rate,
    startTimeLocal: "09:00",
    price: 150000,
  });
  expect(keys(changedRate)).toEqual(["timeWindow", "price"]);
  expect(changedRate.fields[0].before).toContain("08:00");
  expect(changedRate.fields[0].after).toContain("09:00");
  const published = model(
    "PUBLISH_CLASS",
    "Class",
    { status: "Draft" },
    { status: "Published", sessions: 10, breakEvenThreshold: 4 },
    { currentTargetLabel: "Badminton basics" },
  );
  expect(published.fields).toEqual([]);
  expect(published.subject).toBe("Badminton basics");
  expect(published.hideEmptyDetails).toBe(true);
  const cancelled = model("CANCEL_CLASS", "Class", null, {
    confirmedCount: 8,
    activeHoldCount: 2,
    refundPoints: 100,
    sessionsNotProvided: 3,
  });
  expect(keys(cancelled)).toEqual(["confirmedCount", "refundPoints"]);
  expect(cancelled.fields[0].label).toBe("Number of enrolled students");
  const waived = model(
    "WAIVE_CLASS_THRESHOLD",
    "Class",
    { thresholdStatus: "AtRisk" },
    { thresholdStatus: "WaivedByManager" },
    { currentTargetLabel: "Badminton basics" },
  );
  expect(waived.subject).toBe("Badminton basics");
  expect(keys(waived)).toEqual(["thresholdStatus"]);
});

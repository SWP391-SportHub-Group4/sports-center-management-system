import { expect, test, type Page } from "@playwright/test";

const member = {
  userId: "22222222-2222-4222-8222-222222222222",
  fullName: "Nguyễn Thị Thanh Bình",
  email: "thanh.binh.member@example.com",
  phone: "0901234567",
  status: "ACTIVE",
  role: "MEMBER",
};
const sport = {
  sportId: 1,
  code: "badminton",
  name: "Cầu lông",
  isActive: true,
  services: [
    {
      serviceType: "GROUP_COURSE",
      isEnabled: true,
      defaultSessionMinutes: 90,
      defaultMaxCapacity: 20,
    },
  ],
};

test("PT requests stay compact and retain a validated review before approval", async ({
  page,
}) => {
  await setup(page);
  const requestId = "33333333-3333-4333-8333-333333333333";
  let approved: unknown;
  await page.route("**/api/manager/pt-coach-change-requests?**", (route) =>
    route.fulfill({
      json: [
        {
          requestId,
          memberId: member.userId,
          memberName: member.fullName,
          currentCoachName: "Coach Mai",
          requestedCoachName: "Coach Khanh",
          status: "PENDING",
          reason: "Morning availability",
        },
      ],
    }),
  );
  await page.route(
    `**/api/manager/pt-coach-change-requests/${requestId}/approve`,
    (route) => {
      approved = route.request().postDataJSON();
      return route.fulfill({
        json: { movedSessionIds: ["session-one"], unmovedSessionIds: [] },
      });
    },
  );
  await page.goto("/manager/pt?tab=requests&type=coach");
  await expect(page.locator("main tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("Review reason", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review", exact: true });
  await expect(dialog).toContainText("Coach Mai");
  await expect(dialog).toContainText("Coach Khanh");
  const approve = dialog.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeDisabled();
  await dialog
    .getByLabel("Review reason", { exact: true })
    .fill("Matches the member's schedule");
  await approve.click();
  await expect(dialog).toHaveCount(0);
  expect(approved).toEqual({ reviewNote: "Matches the member's schedule" });
  await expect(
    page.getByText("Sessions moved: 1", { exact: true }),
  ).toBeVisible();
});

test("report filters match the selected report and export type", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/reports/membership-period?**", (route) =>
    route.fulfill({ json: { newMembers: 3, activeMembersAtPeriodEnd: 8 } }),
  );
  await page.route("**/api/reports/exports?**", (route) =>
    route.fulfill({
      json: { items: [], page: 1, pageSize: 20, totalCount: 0 },
    }),
  );
  await page.goto("/manager/reports?tab=members");
  await expect(
    page.getByLabel("From date (Vietnam)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Sport", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Source", { exact: true })).toHaveCount(0);
  await page.goto("/manager/reports/exports");
  const filters = page.locator("main form").first();
  const type = filters.getByLabel("Report type", { exact: true });
  await expect(filters.getByLabel("Source", { exact: true })).toBeVisible();
  await type.selectOption("COURT_RENTAL_REVENUE");
  await expect(filters.getByLabel("Sport", { exact: true })).toBeVisible();
  await expect(filters.getByLabel("Source", { exact: true })).toHaveCount(0);
  await type.selectOption("MEMBERSHIP_PERIOD");
  await expect(filters.locator("input[type=date]")).toHaveCount(2);
  await expect(filters.getByLabel("Sport", { exact: true })).toHaveCount(0);
  await expect(filters.getByLabel("Source", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "New members", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toBeEnabled();
});

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({ json: { ...member, role: "CENTER_MANAGER" } });
    if (path === "/api/users")
      return route.fulfill({
        json: { items: [member], totalCount: 1, page: 1, pageSize: 20 },
      });
    if (path === "/api/sports" || path === "/api/manager/sports")
      return route.fulfill({ json: [sport] });
    if (path === "/api/manager/coaches")
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 20 },
      });
    if (path === "/api/system-settings")
      return route.fulfill({
        json: [
          {
            key: "hold.minutes",
            value: "15",
            updatedAt: "2026-10-09T00:00:00Z",
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
}

test("member search has a clear gap above the results table", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/members");
  const search = page.getByLabel("Find a member", { exact: true });
  await expect(page.locator("main tbody tr")).toHaveCount(1);
  const searchBox = (await search.boundingBox())!;
  const tableBox = (await page.locator("main table").boundingBox())!;
  expect(tableBox.y - searchBox.y - searchBox.height).toBeGreaterThanOrEqual(
    16,
  );
});

test("wallet management opens the selected member's adjustment and history in a modal", async ({
  page,
}) => {
  await setup(page);
  let writes = 0;
  await page.route(`**/api/manager/wallets/${member.userId}`, (route) =>
    route.fulfill({
      json: {
        ownerUserId: member.userId,
        availablePoints: 35,
        heldPoints: 2,
        vndPerPoint: 1000,
      },
    }),
  );
  await page.route(
    `**/api/manager/wallets/${member.userId}/ledger?**`,
    (route) =>
      route.fulfill({
        json: [
          {
            id: "ledger-entry",
            entryType: "ADJUSTMENT",
            createdAtUtc: "2026-10-07T15:00:00Z",
            availableDelta: 5,
            heldDelta: 0,
            availableAfter: 35,
            heldAfter: 2,
          },
        ],
      }),
  );
  await page.route("**/api/wallets/**/adjustments", (route) => {
    writes++;
    return route.fulfill({ json: {} });
  });
  await page.goto("/manager/points");
  const open = page.getByRole("button", {
    name: "Wallet management",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Adjust points",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(member.fullName);
  await expect(dialog).toContainText(member.email);
  await expect(dialog.getByLabel("Points", { exact: true })).toHaveValue("1");
  await expect(
    dialog.getByRole("heading", { name: "Point history", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Review adjustment" }),
  ).toBeDisabled();
  await dialog.getByLabel("Reason", { exact: true }).fill("Balance correction");
  await dialog.getByRole("button", { name: "Review adjustment" }).click();
  await expect(
    dialog.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test("rental reports display member names and never expose raw UUIDs in the member column", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/reports/revenue-dimensions?**", (route) =>
    route.fulfill({
      json: {
        fromDate: "2026-10-01",
        toDate: "2026-10-09",
        cashCollected: 240000,
        pointsRedeemedVnd: 0,
        rows: [
          {
            source: "RENTAL",
            sportId: 1,
            sportName: "Badminton",
            memberId: member.userId,
            memberName: member.fullName,
            cashCollected: 120000,
            legacyCashCollected: 0,
            pointsRedeemed: 0,
          },
          {
            source: "RENTAL",
            sportId: 1,
            sportName: "Badminton",
            memberId: "unknown-member-id",
            memberName: null,
            cashCollected: 120000,
            legacyCashCollected: 0,
            pointsRedeemed: 0,
          },
        ],
      },
    }),
  );
  await page.goto("/manager/reports?tab=rentals");
  const table = page.locator("main table");
  await expect(table).toContainText(member.fullName);
  await expect(table).not.toContainText(member.userId);
  await expect(table).not.toContainText("unknown-member-id");
  await expect(
    table.getByRole("columnheader", { name: "Members", exact: true }),
  ).toBeVisible();
});

test("Manager PT sessions show the current schedule, omit history clutter and localize wire status variants", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("sporthub_lang", "vi"));
  const previousId = "95c8f452-83a4-45be-a818-c5eb484ad793";
  const base = {
    sessionId: "replacement-session",
    memberName: "Nguyễn Thùy Linh",
    coachName: "Nguyễn Quốc Khánh",
    startAtUtc: "2026-10-13T01:00:00Z",
    endAtUtc: "2026-10-13T02:30:00Z",
    status: "SCHEDULED",
    quotaState: "RESERVED",
    roomName: "Phòng PT 1",
    cancellationReason: "Historical cancellation note",
    rescheduledFromSessionId: previousId,
    rescheduledFromSession: {
      startAtUtc: "2026-10-12T01:00:00Z",
      endAtUtc: "2026-10-12T02:30:00Z",
      coachName: "Đỗ Quang PT",
      roomName: "Phòng PT 2",
    },
  };
  await page.route("**/api/manager/pt-sessions?**", (route) =>
    route.fulfill({
      json: [
        base,
        ...[
          "RESCHEDULED_ON_TIME",
          "CancelledOnTime",
          "NO_SHOW",
          "RescheduledLate",
        ].map((status, i) => ({
          ...base,
          sessionId: `closed-${i}`,
          memberName: `Hội viên ${i}`,
          status,
          quotaState: "RELEASED",
          rescheduledFromSessionId: null,
        })),
      ],
    }),
  );
  await page.goto("/manager/pt?tab=sessions");
  const article = page.getByRole("article", {
    name: "Nguyễn Thùy Linh · Nguyễn Quốc Khánh",
    exact: true,
  });
  await expect(article).toContainText("13/10/2026");
  await expect(article).toContainText("08:00–09:30");
  await expect(article).toContainText("Nguyễn Quốc Khánh");
  await expect(article).toContainText("Phòng PT 1");
  await expect(article).not.toContainText("Buổi trước:");
  await expect(article).not.toContainText("Lượt tập:");
  await expect(article).not.toContainText("Historical cancellation note");
  await expect(page.locator("main")).not.toContainText(previousId);
  await expect(
    page.getByText("Đã đổi lịch đúng hạn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Đã hủy đúng hạn", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Vắng mặt", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Đã đổi lịch trễ hạn", { exact: true }),
  ).toBeVisible();
  await expect(article.locator("textarea")).toHaveCount(0);
  await article.getByRole("button", { name: "Hủy buổi", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hủy buổi", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Hủy buổi", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Lý do", { exact: true })
    .fill("Hội viên bận công việc");
  await expect(
    dialog.getByRole("button", { name: "Hủy buổi", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("PT sessions do not expose IDs when a previous schedule cannot be resolved", async ({
  page,
}) => {
  await setup(page);
  const previousId = "95c8f452-83a4-45be-a818-c5eb484ad793";
  await page.route("**/api/manager/pt-sessions?**", (route) =>
    route.fulfill({
      json: [
        {
          sessionId: "replacement",
          memberName: member.fullName,
          coachName: "Coach Khánh",
          startAtUtc: "2026-10-13T01:00:00Z",
          endAtUtc: "2026-10-13T02:30:00Z",
          status: "SCHEDULED",
          quotaState: "RESERVED",
          rescheduledFromSessionId: previousId,
        },
      ],
    }),
  );
  await page.goto("/manager/pt?tab=sessions");
  await expect(page.getByRole("article")).toContainText("Coach Khánh");
  await expect(page.getByRole("article")).toContainText("13/10/2026");
  await expect(page.locator("main")).not.toContainText("Previous session");
  await expect(page.locator("main")).not.toContainText(previousId);
});

test("wallet pagination stays aligned and usable across pages; empty first pages omit disabled navigation", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route(`**/api/manager/wallets/${member.userId}`, (route) =>
    route.fulfill({
      json: { ownerUserId: member.userId, availablePoints: 35, heldPoints: 0 },
    }),
  );
  let requestedPage = 0;
  await page.route(
    `**/api/manager/wallets/${member.userId}/ledger?**`,
    (route) => {
      const query = new URL(route.request().url()).searchParams;
      requestedPage = Number(query.get("page"));
      return route.fulfill({
        json: query.get("entryType")
          ? []
          : Array.from({ length: requestedPage === 1 ? 20 : 1 }, (_, i) => ({
              id: `entry-${requestedPage}-${i}`,
              entryType: "ADJUSTMENT",
              createdAtUtc: "2026-10-07T15:00:00Z",
              availableDelta: 1,
              heldDelta: 0,
            })),
      });
    },
  );
  await page.goto("/manager/points");
  await page
    .getByRole("button", { name: "Wallet management", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Adjust points",
    exact: true,
  });
  const nav = dialog.getByRole("navigation", { name: "Point history" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((el) => getComputedStyle(el).alignItems)).toBe(
    "center",
  );
  await nav.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => requestedPage).toBe(2);
  await expect(nav).toContainText("Page 2");
  await expect(
    nav.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  await expect(
    nav.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await nav.getByRole("button", { name: "Previous", exact: true }).click();
  await expect.poll(() => requestedPage).toBe(1);
  await dialog
    .getByRole("combobox", { name: "Event", exact: true })
    .selectOption("SPEND");
  await expect(nav).toHaveCount(0);
  await expect(dialog).toContainText("No point transactions");
});

test("member contact and profile actions remain readable on a narrow screen", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/manager/members");
  const row = page.locator("main tbody tr").first();
  await expect(row).toContainText(member.email);
  await expect(row.getByRole("link", { name: "Open profile" })).toBeVisible();
  expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe(
    "block",
  );
  const contact = row.locator("td").nth(1);
  expect(
    await contact.evaluate(
      (el) =>
        el.getBoundingClientRect().width /
        el.closest("tr")!.getBoundingClientRect().width,
    ),
  ).toBeGreaterThan(0.95);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("operating settings keep their descriptions and editable controls together on mobile", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/manager/settings");
  await expect(page.getByRole("spinbutton")).toHaveValue("15");
  expect(
    await page
      .locator("main tbody tr")
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe("block");
  await page.getByRole("spinbutton").fill("20");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("Coach creation has aligned fields, an explicit specialty hint, and a usable footer", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/manager/coaches");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const email = dialog.getByLabel("Email", { exact: true });
  await expect(email).toBeVisible();
  expect(
    await email.evaluate(
      (el) => getComputedStyle(el.closest(".field")!).alignItems,
    ),
  ).toBe("stretch");
  await expect(
    dialog.getByText("A Coach must have at least one specialty."),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Cầu lông" }).check();
  await expect(
    dialog.getByText("A Coach must have at least one specialty."),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("the new-class wizard does not center or shrink form fields", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/classes/new");
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toBeVisible();
  expect(
    await name.evaluate((el) => {
      const field = el.closest(".field")!;
      return {
        alignment: getComputedStyle(field).alignItems,
        gap:
          field.getBoundingClientRect().width -
          el.getBoundingClientRect().width,
      };
    }),
  ).toEqual({ alignment: "stretch", gap: 0 });
});

test("PT request categories expose a visible selected state", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/manager/pt?tab=requests");
  const session = page.getByRole("button", {
    name: "Session changes",
    exact: true,
  });
  const coach = page.getByRole("button", {
    name: "Coach changes",
    exact: true,
  });
  await expect(session).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(
      async () =>
        (await session.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        )) !==
        (await coach.evaluate((el) => getComputedStyle(el).backgroundColor)),
    )
    .toBeTruthy();
  await coach.click();
  await expect(coach).toHaveAttribute("aria-pressed", "true");
  await expect(session).toHaveAttribute("aria-pressed", "false");
});

test("court rates keep statuses, time windows and both actions on one line", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/room-types", (route) =>
    route.fulfill({
      json: [{ roomTypeId: 1, name: "Sân cầu lông", sportIds: [1] }],
    }),
  );
  await page.route("**/api/manager/court-rates", (route) =>
    route.fulfill({
      json: [
        {
          rateId: 1,
          roomTypeId: 1,
          sportId: 1,
          daysOfWeek: "SUN,MON,TUE,WED,THU,FRI,SAT",
          startTimeLocal: "06:00:00",
          endTimeLocal: "22:00:00",
          pricePerHour: 120000,
          isActive: false,
        },
      ],
    }),
  );
  await page.goto("/manager/catalog?tab=court-rates");
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  const row = page.locator("main tbody tr").first();
  await expect(row).toContainText("Every day");
  await expect(row).toContainText("06:00 – 22:00");
  await expect(page.getByRole("button", { name: "Previous page" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(
    0,
  );
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const edit = await row
      .getByRole("button", { name: "Edit", exact: true })
      .boundingBox();
    const activate = await row
      .getByRole("button", { name: "Activate", exact: true })
      .boundingBox();
    expect(edit).toBeTruthy();
    expect(activate).toBeTruthy();
    expect(Math.abs(edit!.y - activate!.y)).toBeLessThan(1);
    expect(
      await row
        .locator(".chip")
        .evaluate((el) => getComputedStyle(el).whiteSpace),
    ).toBe("nowrap");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.getByLabel("Search", { exact: true }).fill("cầu");
  await expect(
    page.getByRole("button", { name: /Clear filters/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Clear filters/ }).click();
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
});

test("room type creation aligns each sport with its checkbox and submits the selected sports", async ({
  page,
}) => {
  await setup(page);
  const writes: { method: string; path: string; body: unknown }[] = [];
  const types = [{ roomTypeId: 1, name: "Sân cầu lông", sportIds: [1, 3] }];
  await page.route("**/api/room-types", (route) =>
    route.fulfill({ json: types }),
  );
  await page.route("**/api/manager/sports**", (route) =>
    route.fulfill({
      json: [
        sport,
        { ...sport, sportId: 2, name: "Yoga" },
        { ...sport, sportId: 3, name: "Archived sport", isActive: false },
      ],
    }),
  );
  await page.route("**/api/manager/room-types**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: types });
    writes.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body: request.postDataJSON(),
    });
    if (request.method() === "POST")
      return route.fulfill({ json: { roomTypeId: 2 } });
    return route.fulfill({ status: 204 });
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/manager/facilities?tab=types");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("group", { name: "Sports", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Specialties", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole("checkbox", { name: "Archived sport" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Create", exact: true }),
  ).toBeDisabled();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const checkbox = dialog.getByRole("checkbox", {
      name: "Yoga",
      exact: true,
    });
    expect(
      await checkbox.evaluate((el) => {
        const text = el.parentElement!.querySelector("span")!;
        const a = el.getBoundingClientRect(),
          b = text.getBoundingClientRect();
        return Math.abs(a.y + a.height / 2 - (b.y + b.height / 2));
      }),
    ).toBeLessThan(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await dialog.getByLabel("Name", { exact: true }).fill("Phòng đa năng");
  await dialog.getByRole("checkbox", { name: "Yoga", exact: true }).check();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    {
      method: "POST",
      path: "/api/manager/room-types",
      body: { name: "Phòng đa năng" },
    },
    {
      method: "PUT",
      path: "/api/manager/room-types/2/sports",
      body: { sportIds: [2] },
    },
  ]);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(dialog).toHaveAccessibleName("Edit");
  const archived = dialog.getByRole("checkbox", { name: /Archived sport/ });
  await expect(archived).toBeChecked();
  await expect(archived).toBeEnabled();
  await archived.uncheck();
  await expect(archived).not.toBeChecked();
  await expect(archived).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(2);
});

for (const tab of ["sessions", "requests"]) {
  test(
    "PT " + tab + " pagination stays aligned and navigates both ways",
    async ({ page }) => {
      await setup(page);
      const path =
        tab === "sessions" ? "pt-sessions" : "pt-session-change-requests";
      await page.route("**/api/manager/" + path + "?**", (route) => {
        const pageNumber = Number(
          new URL(route.request().url()).searchParams.get("page"),
        );
        const rows = Array.from(
          { length: pageNumber === 1 ? 20 : 1 },
          (_, i) =>
            tab === "sessions"
              ? {
                  sessionId: "session-" + pageNumber + "-" + i,
                  memberName: "Member " + i,
                  coachName: "Coach Kh?nh",
                  startAtUtc: "2026-10-13T01:00:00Z",
                  endAtUtc: "2026-10-13T02:30:00Z",
                  status: "Completed",
                  quotaState: "Consumed",
                }
              : {
                  requestId: "request-" + pageNumber + "-" + i,
                  memberName: "Member " + i,
                  status: "Approved",
                  requestType: "Cancel",
                  timingClassification: "OnTime",
                  reason: "Personal appointment",
                },
        );
        return route.fulfill({ json: rows });
      });
      await page.goto("/manager/pt?tab=" + tab);
      const nav = page
        .getByRole("navigation", { name: "Pagination", exact: true })
        .last();
      const previous = nav.getByRole("button", {
        name: "Previous",
        exact: true,
      });
      const next = nav.getByRole("button", { name: "Next", exact: true });
      await expect(previous).toBeDisabled();
      await expect(next).toBeEnabled();
      await expect(nav).toContainText("Page 1");
      const buttons = await nav
        .locator("button")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
      expect(Math.abs(buttons[0] - buttons[1])).toBeLessThan(1);
      await next.click();
      await expect(nav).toContainText("Page 2");
      await expect(previous).toBeEnabled();
      await expect(next).toBeDisabled();
      await previous.click();
      await expect(nav).toContainText("Page 1");
      await expect(previous).toBeDisabled();
    },
  );
}

import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Browser error:", error.message),
  );
});

const managerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const pendingId = "33333333-3333-4333-8333-333333333333";
const paged = (items: unknown[]) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
});

async function fixture(page: Page) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  const member = {
    userId: memberId,
    fullName: "Member Sample",
    email: "member@example.com",
    phone: "0900000000",
    role: "MEMBER",
    status: "ACTIVE",
    activationPending: false,
    avatarUrl: "https://example.invalid/avatar.png",
    sportIds: [],
  };
  const pending = {
    ...member,
    userId: pendingId,
    fullName: "Pending Member",
    email: "pending@example.com",
    avatarUrl: null,
    activationPending: true,
    activationResendAvailableAtUtc: null as string | null,
  };
  const rooms = [
    {
      roomId: 1,
      name: "Badminton Court A",
      capacity: 12,
      activeClassCount: 1,
      roomTypeId: 3,
      sportId: 3,
      isActive: true,
    },
  ];
  const sports = [
    {
      sportId: 3,
      code: "badminton",
      name: "Badminton",
      isActive: true,
      sortOrder: 1,
      services: [
        {
          serviceType: "GROUP_COURSE",
          isEnabled: true,
          defaultSessionMinutes: 90,
          defaultMaxCapacity: 12,
          offeringId: 31,
        },
        { serviceType: "COURT_RENTAL", isEnabled: true, offeringId: 32 },
      ],
    },
  ];
  let reportStatus = "OPEN";
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-manager");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("https://example.invalid/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (req.method() !== "GET")
      calls.push({
        path,
        method: req.method(),
        body: req.postDataJSON() as Record<string, unknown> | null,
      });
    let data: unknown;
    if (path === "/api/users/me")
      data = {
        userId: managerId,
        fullName: "Center Manager",
        email: "manager@example.com",
        role: "CENTER_MANAGER",
        sportIds: [],
      };
    else if (path.includes("notifications"))
      data = path.endsWith("unread-count") ? { count: 0 } : [];
    else if (path === "/api/users") data = paged([member, pending]);
    else if (path === `/api/users/${memberId}`) data = member;
    else if (
      path === `/api/members/front-desk/${pendingId}/resend-activation`
    ) {
      pending.activationResendAvailableAtUtc = new Date(
        Date.now() + 60000,
      ).toISOString();
      data = pending;
    } else if (path === `/api/members/front-desk/${pendingId}/email`) {
      pending.email = String(req.postDataJSON().email);
      data = pending;
    } else if (path === `/api/manager/users/${memberId}/avatar`) {
      member.avatarUrl = "";
      reportStatus = "REMOVED";
      data = { userId: memberId, avatarUrl: null };
    } else if (path.endsWith("/enrollments"))
      data = paged([
        {
          enrollmentId: "enrollment",
          classId: 8,
          className: "Badminton fundamentals",
          sportName: "Badminton",
          status: "CONFIRMED",
          coachName: "Coach Sample",
        },
      ]);
    else if (path.endsWith("/packages") || path === "/api/member-packages") {
      const rows = [
        {
          memberPackageId: "package",
          packageId: 1,
          memberId,
          memberName: member.fullName,
          packageName: "Gym monthly",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          status: "ACTIVE",
        },
      ];
      data = path === "/api/member-packages" ? paged(rows) : rows;
    } else if (path === "/api/manager/requests/summary")
      data = {
        coach: 0,
        refunds: 0,
        support: 0,
        avatar: reportStatus === "OPEN" ? 1 : 0,
      };
    else if (path === "/api/manager/avatar-reports")
      data = paged(
        reportStatus === "OPEN"
          ? [
              {
                reportId: "report",
                targetUserId: memberId,
                targetName: member.fullName,
                targetRole: "MEMBER",
                avatarUrl: member.avatarUrl,
                currentAvatarUrl: member.avatarUrl,
                reason: "Inappropriate profile photo",
                status: reportStatus,
                createdAtUtc: "2026-10-20T03:00:00Z",
              },
            ]
          : [],
      );
    else if (path.endsWith("/dismiss")) {
      reportStatus = "DISMISSED";
      data = {};
    } else if (path === "/api/manager/class-session-change-requests/filters")
      data = { classes: [], coaches: [] };
    else if (
      path === "/api/manager/class-session-change-requests" ||
      path === "/api/refunds" ||
      path === "/api/member-support-requests/queue"
    )
      data = paged([]);
    else if (path === "/api/member-support-requests/assignees") data = [];
    else if (path === "/api/sports" || path === "/api/manager/sports")
      data = sports;
    else if (path === "/api/membership-packages")
      data = [
        {
          packageId: 1,
          name: "Gym monthly",
          price: 300000,
          durationDays: 30,
          isActive: true,
        },
      ];
    else if (path === "/api/room-types")
      data = [
        {
          roomTypeId: 3,
          name: "Legacy badminton type",
          sportIds: [3],
          isActive: true,
        },
      ];
    else if (path === "/api/rooms") {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        const created = {
          ...rooms[0],
          roomId: 2,
          name: body.name,
          sportId: body.sportId,
        };
        rooms.push(created);
        data = created;
      } else data = rooms;
    } else if (path.includes("opening-hours"))
      data = [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
        dayOfWeek,
        openTimeLocal: "06:00",
        closeTimeLocal: "22:00",
      }));
    else if (path === "/api/manager/room-blocks") data = [];
    else if (path === "/api/manager/court-rates")
      data = [
        {
          rateId: 1,
          roomId: 1,
          roomTypeId: 3,
          sportId: 3,
          daysOfWeek: "MON,TUE,WED,THU,FRI,SAT,SUN",
          startTimeLocal: "06:00",
          endTimeLocal: "22:00",
          pricePerHour: 100000,
          isActive: true,
        },
      ];
    else if (path === "/api/course-interests")
      data = paged([
        {
          courseInterestId: "interest",
          memberId,
          memberName: member.fullName,
          sportName: "Badminton",
        },
      ]);
    else if (path === "/api/reports/revenue")
      data = {
        fromDate: "2026-10-01",
        toDate: "2026-10-20",
        totalCollected: 1000000,
        netRevenue: 1000000,
        pointsRedeemed: 100,
        pointsRefunded: 20,
        pointsIssued: 20,
        managerPointAdjustment: 0,
        outstandingPoints: 500,
        paymentCount: 2,
        byDay: [],
        bySportAndSource: [],
      };
    else if (path.startsWith("/api/manager/wallets/"))
      data = path.endsWith("ledger")
        ? []
        : {
            ownerUserId: memberId,
            availablePoints: 500,
            heldPoints: 0,
            totalPoints: 500,
            vndPerPoint: 1000,
          };
    else
      return route.fulfill({
        status: 404,
        json: { error: "fixture_missing", message: path },
      });
    return route.fulfill({
      status: req.method() === "POST" && path === "/api/rooms" ? 201 : 200,
      json: data,
    });
  });
  return calls;
}

test("manager navigation and course interests match the agreed workspace", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/manager/classes/interests");
  await page.getByRole("button", { name: "Services", exact: true }).click();
  for (const name of [
    "Sports",
    "Courts & Rooms",
    "Membership",
    "Classes",
    "Course interests",
  ])
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Room types", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await expect(page.getByRole("columnheader")).toHaveText(["Member", "Sport"]);
  await expect(
    page.getByRole("cell", { name: "Member Sample", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Badminton", exact: true }),
  ).toBeVisible();
});

test("avatar reports open account details and a removal closes the request", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/manager/requests?type=avatar");
  await expect(
    page.getByRole("cell", {
      name: "Inappropriate profile photo",
      exact: true,
    }),
  ).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `../.tmp/manager-workspace-request-${name}.png`,
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Memberships", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Health/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Assign coach", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Classes", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Badminton fundamentals", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove photo", exact: true }),
  ).toHaveCount(0);
  expect(
    calls.some((c) => c.method === "DELETE" && c.path.endsWith("/avatar")),
  ).toBe(true);
  await page.goto("/manager/requests?type=avatar");
  await expect(
    page.getByText("No avatar reports match these filters."),
  ).toBeVisible();
});

test("activation actions stay in the list and room creation selects only sport", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/manager/members");
  const pending = page
    .getByRole("row")
    .filter({ hasText: "pending@example.com" });
  await expect(pending.getByRole("button", { name: /Resend/ })).toBeVisible();
  await expect(pending.getByRole("button", { name: /email/i })).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "member@example.com" })
      .getByRole("button", { name: /Resend/ }),
  ).toHaveCount(0);
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `../.tmp/manager-workspace-members-${name}.png`,
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/manager/facilities");
  await page
    .getByRole("button", { name: "Add room only", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel(/Room type/)).toHaveCount(0);
  await form.getByLabel(/^Name/).fill("New badminton court");
  await form.getByLabel(/^Sport/).selectOption("3");
  await form
    .getByRole("button", { name: /Save|Create/ })
    .last()
    .click();
  await expect(
    page.getByRole("rowheader", { name: "New badminton court", exact: true }),
  ).toBeVisible();
  const request = calls.find(
    (c) => c.method === "POST" && c.path === "/api/rooms",
  );
  expect(request?.body?.sportId).toBe(3);
  expect(request?.body).not.toHaveProperty("roomTypeId");
  await page.goto("/manager/facilities/1");
  await page.getByRole("tab", { name: "Rental pricing", exact: true }).click();
  await expect(page.getByRole("cell", { name: /100[.,]000/ })).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `../.tmp/manager-workspace-court-${name}.png`,
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
});

test("manager wallets provide history without manual adjustments", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/manager/points");
  await expect(
    page.getByRole("button", {
      name: /Request credit|Approve credit|Adjust points/i,
    }),
  ).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "member@example.com" });
  await row.getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /Credit|Debit|Adjust|Save/i }),
  ).toHaveCount(0);
  expect(calls.some((c) => c.path.includes("adjustments"))).toBe(false);
});

test("membership buyer list is scoped to the chosen plan and links to member details", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/manager/membership-plans");
  const request = page.waitForRequest(
    (req) => new URL(req.url()).pathname === "/api/member-packages",
  );
  await page.getByRole("button", { name: "View members", exact: true }).click();
  expect(new URL((await request).url()).searchParams.get("packageId")).toBe(
    "1",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Member Sample", exact: true }),
  ).toHaveAttribute("href", `/manager/members/${memberId}`);
});

test("dismissing an avatar report refreshes both the queue and its pending count", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/manager/requests?type=avatar");
  await expect(
    page.getByRole("tab", { name: "Avatar reports1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByText("No avatar reports match these filters."),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Avatar reports", exact: true }),
  ).toBeVisible();
});

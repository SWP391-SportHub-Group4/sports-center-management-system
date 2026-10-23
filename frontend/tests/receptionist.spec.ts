import { expect, test, type Page } from "@playwright/test";

const receptionistId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const enrollmentId = "44444444-4444-4444-8444-444444444444";

const paged = (items: unknown[]) => ({
  items,
  page: 1,
  pageSize: 20,
  totalCount: items.length,
});

async function receptionistFixture(page: Page) {
  await page.clock.install({
    time: new Date("2030-10-03T03:00:00Z"),
  });

  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "receptionist-fixture-token");

    localStorage.setItem("sporthub_lang", "en");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/users/me") {
      return route.fulfill({
        json: {
          userId: receptionistId,
          fullName: "Receptionist",
          email: "desk@example.com",
          role: "RECEPTIONIST",
          sportIds: [],
        },
      });
    }

    if (path.includes("notifications")) {
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    }

    if (path === "/api/sports") {
      return route.fulfill({
        json: [
          {
            sportId: 3,
            name: "Badminton",
            code: "course",
            services: [
              {
                serviceType: "GROUP_COURSE",
                isEnabled: true,
                defaultSessionMinutes: 90,
                defaultMaxCapacity: 12,
              },
            ],
            isActive: true,
          },
        ],
      });
    }

    if (path === "/api/users") {
      return route.fulfill({
        json: paged([
          {
            userId: memberId,
            fullName: "Member A",
            email: "member@example.com",
            phone: "0900000000",
            role: "MEMBER",
            status: "ACTIVE",
            createdAt: "2030-01-01T00:00:00Z",
            hasPassword: true,
            hasGoogleLink: false,
            sportIds: [],
          },
        ]),
      });
    }

    if (path === `/api/users/${memberId}`) {
      return route.fulfill({
        json: {
          userId: memberId,
          fullName: "Member A",
          email: "member@example.com",
          phone: "0900000000",
          role: "MEMBER",
          status: "ACTIVE",
          createdAt: "2030-01-01T00:00:00Z",
          hasPassword: true,
          hasGoogleLink: false,
          sportIds: [],
        },
      });
    }

    if (path === `/api/members/${memberId}/packages`) {
      return route.fulfill({
        json: [
          {
            memberPackageId: "55555555-5555-4555-8555-555555555555",
            packageId: 1,
            packageName: "Gym monthly",
            startDate: "2030-10-01",
            endDate: "2030-10-31",
            status: "ACTIVE",
            isUsable: true,
          },
        ],
      });
    }

    if (path === `/api/members/${memberId}/gym-checkins`) {
      return route.fulfill({
        json: paged([]),
      });
    }

    if (path === "/api/gym-checkins" && request.method() === "POST") {
      return route.fulfill({
        json: {
          checkInId: "66666666-6666-4666-8666-666666666666",
          memberId,
          checkInTime: "2030-10-03T03:00:00Z",
        },
      });
    }

    if (path === "/api/invoices") {
      return route.fulfill({
        json: paged([]),
      });
    }

    if (path === "/api/manager/court-schedule") {
      return route.fulfill({
        json: [
          {
            sourceType: "CLASS_SESSION",
            sourceId: sessionId,
            classId: 7,
            title: "Badminton group",
            roomId: 3,
            coachId: "77777777-7777-4777-8777-777777777777",
            coachName: "Coach A",
            startAtUtc: "2030-10-03T02:30:00Z",
            endAtUtc: "2030-10-03T04:00:00Z",
          },
        ],
      });
    }

    if (path === `/api/class-sessions/${sessionId}/roster`) {
      return route.fulfill({
        json: {
          session: {
            sessionId,
            classId: 7,
            className: "Badminton group",
            sessionNo: 1,
            roomId: 3,
            roomName: "Court 3",
            coachId: "77777777-7777-4777-8777-777777777777",
            coachName: "Coach A",
            startAtUtc: "2030-10-03T02:30:00Z",
            endAtUtc: "2030-10-03T04:00:00Z",
            status: "SCHEDULED",
            isMakeup: false,
            rescheduledFromSessionId: null,
          },
          attendanceOpensAtUtc: "2030-10-03T02:30:00Z",
          attendanceClosesAtUtc: "2030-10-04T04:00:00Z",
          entries: [
            {
              enrollmentId,
              memberId,
              memberName: "Member A",
              enrollmentStatus: "CONFIRMED",
              attendanceStatus: null,
              attendanceRecordedAt: null,
            },
          ],
        },
      });
    }

    if (
      path === `/api/class-sessions/${sessionId}/attendance/${enrollmentId}` &&
      request.method() === "PUT"
    ) {
      return route.fulfill({
        json: {
          ok: true,
        },
      });
    }

    return route.fulfill({
      status: 404,
      json: {
        code: "fixture_missing",
        message: `${request.method()} ${path}`,
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await receptionistFixture(page);
});

test("receptionist dashboard uses real operational links and no manual-paid workflow", async ({
  page,
}) => {
  await page.goto("/receptionist");

  await expect(
    page.getByRole("heading", {
      name: "Today's desk",
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.locator(
      "a[href*='/receptionist/attendance?date=2030-10-03&session=']",
    ),
  ).toHaveCount(1);

  await expect(page.getByText(/manual paid/i)).toHaveCount(0);

  await expect(page.getByText(/cash payout/i)).toHaveCount(0);
});

test("receptionist can start a court rental for the selected member from Sell a service", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "sporthub.desk.member",
      JSON.stringify({
        userId: "22222222-2222-4222-8222-222222222222",
        fullName: "Member A",
        email: "member@example.com",
        phone: "0900000000",
        role: "MEMBER",
        status: "ACTIVE",
      }),
    );
  });
  await page.route("**/api/sports*", (route) =>
    route.fulfill({
      json: [
        {
          sportId: 3,
          name: "Badminton",
          code: "badminton",
          isActive: true,
          services: [{ serviceType: "COURT_RENTAL", isEnabled: true }],
        },
      ],
    }),
  );
  await page.route("**/api/court-rentals/policy", (route) =>
    route.fulfill({
      json: {
        slotMinutes: 60,
        maxHours: 4,
        advanceDays: 30,
        cancelFreeHours: 24,
        serverNowUtc: "2030-10-03T03:00:00Z",
      },
    }),
  );
  let calendarMember: string | null = null;
  await page.route("**/api/court-rentals/calendar?*", (route) => {
    calendarMember = new URL(route.request().url()).searchParams.get(
      "targetMemberId",
    );
    return route.fulfill({
      json: {
        sportId: 3,
        date: "2030-10-03",
        serverNowUtc: "2030-10-03T03:00:00Z",
        rooms: [
          {
            roomId: 8,
            name: "Court 8",
            slots: [
              {
                startUtc: "2030-10-03T04:00:00Z",
                endUtc: "2030-10-03T05:00:00Z",
                status: "AVAILABLE",
                totalPrice: 100000,
                blocks: [],
              },
            ],
          },
        ],
      },
    });
  });
  let checkoutBody: Record<string, unknown> | null = null;
  await page.route("**/api/checkouts/court-rental", (route) => {
    checkoutBody = route.request().postDataJSON();
    return route.fulfill({ status: 400, json: { code: "test_stop" } });
  });

  await page.goto("/receptionist");
  await expect(
    page.getByRole("link", { name: "Sell a service" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Buy Day Pass/ })).toHaveCount(0);

  await page.goto("/receptionist/sales?tab=courts");
  await expect(page.getByText("Selling for Member A")).toHaveCount(0);
  await page.getByRole("button", { name: "Badminton" }).click();
  await expect.poll(() => calendarMember).toBe(memberId);
  await page.getByRole("button", { name: /11:00.*12:00/ }).click();
  await page.getByRole("button", { name: "Payment", exact: true }).click();
  await expect
    .poll(() => checkoutBody)
    .toMatchObject({
      sportId: 3,
      roomId: 8,
      targetMemberId: memberId,
    });
});

test("receptionist selects a Member and performs server-authorized Gym check-in", async ({
  page,
}) => {
  let checkIns = 0;

  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/gym-checkins"
    ) {
      checkIns++;
    }
  });

  await page.goto("/receptionist/gym-checkin");

  await page.getByLabel("Select Member").fill("Member A");

  await page.waitForTimeout(250);

  await page
    .getByRole("button", {
      name: /Member A/,
    })
    .click();

  await page
    .getByRole("button", {
      name: "Check in",
      exact: true,
    })
    .click();

  await expect.poll(() => checkIns).toBe(1);
});

test("only receptionist UI writes group attendance and uses enrollment+session identity", async ({
  page,
}) => {
  let payload: unknown = null;

  await page.route(
    `**/api/class-sessions/${sessionId}/attendance/${enrollmentId}`,
    async (route) => {
      payload = route.request().postDataJSON();

      await route.fulfill({
        json: {
          ok: true,
        },
      });
    },
  );

  await page.goto("/receptionist/attendance");

  await page.getByRole("button", { name: /Badminton group/ }).click();

  await expect(page.getByRole("row", { name: /Member A/ })).toBeVisible();
  await page
    .getByRole("row", { name: /Member A/ })
    .getByRole("button", { name: "Options" })
    .click();
  await page
    .getByRole("button", {
      name: "Present",
      exact: true,
    })
    .click();

  await expect
    .poll(() => payload)
    .toEqual({
      status: "PRESENT",
    });
});

test("attendance identifies an inactive member and blocks editing their row", async ({
  page,
}) => {
  await page.route(`**/api/class-sessions/${sessionId}/roster`, (route) =>
    route.fulfill({
      json: {
        session: {
          sessionId,
          className: "Badminton group",
          sessionNo: 1,
          coachName: "Coach A",
          startAtUtc: "2030-10-03T02:30:00Z",
          endAtUtc: "2030-10-03T04:00:00Z",
        },
        entries: [
          {
            enrollmentId,
            memberId,
            memberName: "Member A",
            enrollmentStatus: "CONFIRMED",
            attendanceStatus: null,
            attendanceRecordedAt: null,
            memberIsActive: false,
          },
        ],
      },
    }),
  );
  await page.goto("/receptionist/attendance");
  await page.getByRole("button", { name: /Badminton group/ }).click();
  const row = page.getByRole("row", { name: /Member A/ });
  await expect(row.getByText("Account locked / deactivated")).toBeVisible();
  await expect(row.getByRole("button", { name: "Options" })).toHaveCount(0);
});

test("one attendance calendar filters sessions by class, member and status", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule?*", (route) =>
    route.fulfill({
      json: [
        {
          sourceType: "CLASS_SESSION",
          sourceId: sessionId,
          classId: 7,
          title: "Badminton group",
          status: "SCHEDULED",
          coachName: "Coach A",
          startAtUtc: "2030-10-03T02:30:00Z",
          endAtUtc: "2030-10-03T04:00:00Z",
          participants: [
            {
              memberId,
              memberName: "Member A",
              enrollmentId,
              attendanceStatus: null,
            },
          ],
        },
        {
          sourceType: "CLASS_SESSION",
          sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          classId: 8,
          title: "Basketball group",
          status: "SCHEDULED",
          coachName: "Coach B",
          startAtUtc: "2030-10-03T06:00:00Z",
          endAtUtc: "2030-10-03T07:00:00Z",
          participants: [
            {
              memberId: "88888888-8888-4888-8888-888888888888",
              memberName: "Member B",
              enrollmentId: "55555555-5555-4555-8555-555555555555",
              attendanceStatus: null,
            },
          ],
        },
      ],
    }),
  );
  await page.goto("/receptionist/attendance");
  await expect(
    page.getByRole("button", { name: /Badminton group/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Basketball group/ }),
  ).toBeVisible();
  await page
    .getByLabel("Member", { exact: true })
    .selectOption({ label: "Member A" });
  await expect(
    page.getByRole("button", { name: /Basketball group/ }),
  ).toHaveCount(0);
  await page.getByLabel("Class status").selectOption("live");
  await expect(
    page.getByRole("button", { name: /Badminton group/ }),
  ).toBeVisible();
  await page.getByLabel("Class status").selectOption("locked");
  await expect(
    page.getByRole("button", { name: /Badminton group/ }),
  ).toHaveCount(0);
});

test("a day without classes points to the nearest day that has one", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule?*", (route) =>
    route.fulfill({
      json: [
        {
          sourceType: "CLASS_SESSION",
          sourceId: sessionId,
          classId: 7,
          title: "Badminton group",
          roomId: 3,
          status: "SCHEDULED",
          coachName: "Coach A",
          startAtUtc: "2030-10-04T02:30:00Z",
          endAtUtc: "2030-10-04T04:00:00Z",
          participants: [],
        },
      ],
    }),
  );

  await page.goto("/receptionist/attendance");
  await expect(
    page.getByText("No classes match the filters on 03/10/2030."),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Nearest class day: 04/10/2030 (1 sessions)",
    })
    .click();
  await expect(page.getByText("Class schedule · 04/10/2030")).toBeVisible();
  await page.getByRole("button", { name: /Badminton group/ }).click();
  await expect(page.getByText("Member A")).toBeVisible();
});

test("the calendar marks class days and follows the month", async ({
  page,
}) => {
  await page.route("**/api/manager/court-schedule?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const includesNovember30 =
      params.get("fromDate")! <= "2030-11-30" &&
      params.get("toDate")! >= "2030-11-30";
    return route.fulfill({
      json: includesNovember30
        ? [
            {
              sourceType: "CLASS_SESSION",
              sourceId: sessionId,
              classId: 7,
              title: "Badminton group",
              roomId: 3,
              status: "SCHEDULED",
              coachName: "Coach A",
              startAtUtc: "2030-11-30T00:00:00Z",
              endAtUtc: "2030-11-30T02:00:00Z",
              participants: [],
            },
          ]
        : [],
    });
  });

  await page.goto("/receptionist/attendance?date=2030-10-19");
  await expect(page.getByText("Tháng 10/2030")).toBeVisible();
  await page.getByRole("button", { name: "Tháng sau" }).click();
  await expect(page.getByText("Tháng 11/2030")).toBeVisible();
  const day = page.getByRole("button", { name: "30/11/2030, 1 sessions" });
  await expect(day).toBeVisible();
  await day.click();
  await expect(
    page.getByRole("button", { name: /Badminton group/ }),
  ).toBeVisible();
});

test("class lookup shows the 24-hour correction window and locks old sessions", async ({
  page,
}) => {
  const oldSessionId = "99999999-9999-4999-8999-999999999999";
  const session = (id: string, no: number, start: string, end: string) => ({
    sessionId: id,
    classId: 7,
    className: "Badminton 01",
    sessionNo: no,
    roomId: 3,
    roomName: "Court 3",
    coachId: "77777777-7777-4777-8777-777777777777",
    coachName: "Coach A",
    startAtUtc: start,
    endAtUtc: end,
    status: "COMPLETED",
    isMakeup: false,
    rescheduledFromSessionId: null,
  });
  const rosterFor = (
    id: string,
    no: number,
    start: string,
    end: string,
    closes: string,
    status: string | null,
  ) => ({
    session: session(id, no, start, end),
    attendanceOpensAtUtc: start,
    attendanceClosesAtUtc: closes,
    entries: [
      {
        enrollmentId,
        memberId,
        memberName: "Member A",
        enrollmentStatus: "CONFIRMED",
        attendanceStatus: status,
        attendanceRecordedAt: null,
      },
      {
        enrollmentId: "55555555-5555-4555-8555-555555555555",
        memberId: "88888888-8888-4888-8888-888888888888",
        memberName: "Member B",
        enrollmentStatus: "CONFIRMED",
        attendanceStatus: "PRESENT",
        attendanceRecordedAt: null,
      },
    ],
  });
  await page.route("**/api/classes?*", (route) =>
    route.fulfill({
      json: paged([{ classId: 7, name: "Badminton 01" }]),
    }),
  );
  // Clock is 2030-10-03T03:00Z: the first session ended 2 hours ago, the second 2 days ago.
  await page.route("**/api/classes/7/sessions", (route) =>
    route.fulfill({
      json: [
        session(sessionId, 2, "2030-10-03T00:00:00Z", "2030-10-03T01:00:00Z"),
        session(
          oldSessionId,
          1,
          "2030-10-01T00:00:00Z",
          "2030-10-01T01:00:00Z",
        ),
        {
          ...session(
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            3,
            "2030-10-10T00:00:00Z",
            "2030-10-10T01:00:00Z",
          ),
          status: "SCHEDULED",
        },
      ],
    }),
  );
  await page.route(`**/api/class-sessions/${sessionId}/roster`, (route) =>
    route.fulfill({
      json: rosterFor(
        sessionId,
        2,
        "2030-10-03T00:00:00Z",
        "2030-10-03T01:00:00Z",
        "2030-10-04T01:00:00Z",
        "PRESENT",
      ),
    }),
  );
  await page.route(`**/api/class-sessions/${oldSessionId}/roster`, (route) =>
    route.fulfill({
      json: rosterFor(
        oldSessionId,
        1,
        "2030-10-01T00:00:00Z",
        "2030-10-01T01:00:00Z",
        "2030-10-02T01:00:00Z",
        "ABSENT",
      ),
    }),
  );
  let payload: unknown = null;
  await page.route(
    `**/api/class-sessions/${sessionId}/attendance/${enrollmentId}`,
    (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    },
  );

  await page.route("**/api/manager/court-schedule?*", (route) =>
    route.fulfill({
      json: [
        {
          sourceType: "CLASS_SESSION",
          sourceId: sessionId,
          classId: 7,
          title: "Badminton 01",
          roomId: 3,
          coachName: "Coach A",
          startAtUtc: "2030-10-03T00:00:00Z",
          endAtUtc: "2030-10-03T01:00:00Z",
          status: "COMPLETED",
          participants: [
            {
              memberId,
              memberName: "Member A",
              enrollmentId,
              attendanceStatus: "PRESENT",
            },
          ],
        },
        {
          sourceType: "CLASS_SESSION",
          sourceId: oldSessionId,
          classId: 7,
          title: "Badminton 01",
          roomId: 3,
          coachName: "Coach A",
          startAtUtc: "2030-10-01T00:00:00Z",
          endAtUtc: "2030-10-01T01:00:00Z",
          status: "COMPLETED",
          participants: [
            {
              memberId,
              memberName: "Member A",
              enrollmentId,
              attendanceStatus: "ABSENT",
            },
          ],
        },
      ],
    }),
  );
  await page.goto("/receptionist/attendance");
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "Badminton 01" });
  await expect(page.getByText("Correction open").first()).toBeVisible();
  await expect(page.getByText("Locked", { exact: true }).first()).toBeVisible();

  // Within 24 hours: the roster opens in correction mode and Absent can be changed to Present.
  await page.getByRole("button", { name: /Badminton 01/ }).click();
  await page.getByRole("button", { name: "Sửa điểm danh" }).click();
  const row = page.getByRole("row", { name: /Member A/ });
  await row.getByRole("button", { name: "Options" }).click();
  await expect(row.getByRole("button", { name: "Present" })).toBeEnabled();
  await page.getByLabel("Tìm hội viên trong buổi học").fill("zzz");
  await expect(
    page.getByText("Không có hội viên phù hợp với tìm kiếm hoặc bộ lọc."),
  ).toBeVisible();
  await page.getByLabel("Tìm hội viên trong buổi học").fill("member a");
  await row.getByRole("button", { name: "Absent" }).click();
  await expect.poll(() => payload).toEqual({ status: "ABSENT" });

  // Older than 24 hours: read-only.
  await page.getByRole("button", { name: "Quay lại" }).click();
  await page.getByLabel("Date", { exact: true }).fill("2030-10-01");
  await page.getByRole("button", { name: /Badminton 01/ }).click();
  await expect(page.getByText(/Đã quá 24 giờ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Options" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sửa điểm danh" })).toHaveCount(
    0,
  );
});

test("the selected Member follows the desk from check-in to sales and profile", async ({
  page,
}) => {
  let checkIns = 0;

  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/gym-checkins"
    ) {
      checkIns++;
    }
  });

  await page.goto("/receptionist");

  await page.getByLabel("Find a member").fill("Member A");

  await page.getByRole("option", { name: /Member A/ }).click();

  await expect(
    page.getByRole("heading", {
      name: "Member A",
    }),
  ).toBeVisible();

  await expect(
    page
      .getByRole("region", { name: "Selected member" })
      .getByText("Gym monthly · expires 23:59 31/10/2030"),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Check in",
      exact: true,
    })
    .click();

  await expect.poll(() => checkIns).toBe(1);

  await expect(
    page.getByRole("status").filter({
      hasText: "Saved successfully.",
    }),
  ).toBeVisible();

  /*
   * Sales is no longer a top-level navigation item.
   * Use the selected-member action.
   */
  await page
    .getByRole("link", {
      name: "Sell a service",
      exact: true,
    })
    .click();

  // Quầy dùng cùng giao diện Explore của Member: gói Gym nằm trong mục "Gym Membership".
  await expect(
    page.getByRole("region", { name: "Gym Membership" }),
  ).toBeVisible();
  await expect(page.getByTestId("staff-owned")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Member's services" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Packages" })).toBeVisible();
  await expect(page.getByText("Selling for Member A")).toHaveCount(0);

  await page
    .getByRole("link", {
      name: "Today's desk",
      exact: true,
    })
    .first()
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Member A",
    }),
  ).toBeVisible();

  await page
    .getByRole("link", {
      name: "Open profile",
      exact: true,
    })
    .click();

  await page
    .getByRole("tab", {
      name: "Wallet",
      exact: true,
    })
    .click();

  await expect(page.getByText(/never added or removed/)).toBeVisible();

  await expect(
    page.getByRole("button", {
      name: /adjust/i,
    }),
  ).toHaveCount(0);
});

test("no search result lets the front desk register a new member with an activation email", async ({
  page,
}) => {
  await page.route("**/api/users?**", (route) =>
    route.fulfill({
      json: paged([]),
    }),
  );

  await page.goto("/receptionist");

  await page.getByLabel("Find a member").fill("Nobody");

  await expect(page.getByText("No matching members.")).toBeVisible();

  await page
    .getByRole("button", { name: "Register member", exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Confirm email")).toHaveCount(0);
  await expect(dialog).toContainText("activation");
  await expect(dialog.getByLabel("Password")).toHaveCount(0);
});

test("attendance deep link opens the right class session", async ({ page }) => {
  await page.goto(
    `/receptionist/attendance?date=2030-10-03&session=${sessionId}`,
  );

  await expect(page.getByRole("row", { name: /Member A/ })).toBeVisible();
  await expect(page.getByText("Đang điểm danh")).toBeVisible();
  await expect(page.getByText("0/1")).toBeVisible();
});

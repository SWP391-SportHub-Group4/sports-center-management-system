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

    if (path === "/api/gym-checkins/inside") {
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
          checkOutTime: null,
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

  await page.getByLabel("Class session").selectOption(sessionId);

  await expect(page.getByRole("row", { name: /Member A/ })).toBeVisible();

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

test("attendance finds the next class day when the selected day has no sessions", async ({
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
          startAtUtc: "2030-10-04T02:30:00Z",
          endAtUtc: "2030-10-04T04:00:00Z",
        },
      ],
    }),
  );

  await page.goto("/receptionist/attendance");
  await expect(
    page.getByText("No class sessions are scheduled for 03/10/2030."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next class day: 04/10/2030 (1 session)" })
    .click();
  await page.getByLabel("Class session").selectOption(sessionId);
  await expect(page.getByText("Member A")).toBeVisible();

  const previousDay = await page
    .getByRole("button", { name: "Previous day" })
    .boundingBox();
  const calendar = await page.getByLabel("Choose date").boundingBox();
  expect(previousDay).not.toBeNull();
  expect(calendar).not.toBeNull();
  expect(Math.abs(previousDay!.y - calendar!.y)).toBeLessThan(2);

  const summary = page.getByRole("region", { name: "Session summary" });
  const status = await summary
    .getByText("Status", { exact: true })
    .locator("..")
    .boundingBox();
  const window = await summary
    .getByText("Attendance window", { exact: true })
    .locator("..")
    .boundingBox();
  expect(status).not.toBeNull();
  expect(window).not.toBeNull();
  expect(status!.width).toBeLessThan(window!.width);
});

test("attendance finds sessions beyond the first 30-day schedule window", async ({
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
              startAtUtc: "2030-11-30T00:00:00Z",
              endAtUtc: "2030-11-30T02:00:00Z",
            },
          ]
        : [],
    });
  });

  await page.goto("/receptionist/attendance?date=2030-10-19");
  await page
    .getByRole("button", { name: "Next class day: 30/11/2030 (1 session)" })
    .click();
  await expect(page.getByLabel("Class session")).toContainText(
    "Badminton group",
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

  await expect(page.getByText("Active until")).toBeVisible();

  await page
    .getByRole("button", {
      name: "Check in",
      exact: true,
    })
    .click();

  await expect.poll(() => checkIns).toBe(1);

  await expect(
    page.getByRole("status").filter({
      hasText: "Checked in at",
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

  await expect(page.getByRole("tab", { name: "Gym membership" })).toBeVisible();
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

test("attendance deep link opens the right class session and explains a closed window", async ({
  page,
}) => {
  await page.goto(
    `/receptionist/attendance?date=2030-10-03&session=${sessionId}`,
  );

  await expect(page.getByRole("row", { name: /Member A/ })).toBeVisible();

  await expect(page.getByText("0 of 1 recorded")).toBeVisible();
});

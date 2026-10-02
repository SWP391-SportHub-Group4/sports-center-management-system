import { expect, test, type Page } from "@playwright/test";

async function fixture(
  page: Page,
  {
    sportId = 3,
    language = "en",
    empty = false,
    failOnce = false,
  }: {
    sportId?: number;
    language?: "en" | "vi";
    empty?: boolean;
    failOnce?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let failed = false;
  await page.clock.setFixedTime(new Date("2030-10-03T02:00:00Z"));
  await page.addInitScript((language) => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", language);
  }, language);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    calls.push(request.method() + " " + path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "00000000-0000-0000-0000-000000000001",
          email: "coach@example.com",
          fullName: "Test Coach",
          role: "COACH",
          sportIds: [sportId],
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 2,
            name: "Personal training",
            operationType: "ONE_ON_ONE",
          },
          { sportId: 3, name: "Cầu lông", operationType: "GROUP_COURSE" },
          { sportId: 4, name: "Bóng rổ", operationType: "GROUP_COURSE" },
        ],
      });
    if (path === "/api/rooms")
      return route.fulfill({ json: [{ roomId: 1, name: "Assigned court" }] });
    if (
      path.includes("notifications") ||
      path === "/api/coach-member-relationships"
    )
      return route.fulfill({ json: [] });
    if (path === "/api/coaches/me/court-schedule") {
      expect(url.searchParams.get("fromDate")).toBe("2030-10-03");
      expect(url.searchParams.get("toDate")).toBe("2030-10-09");
      if (failOnce && !failed) {
        failed = true;
        return route.fulfill({
          status: 500,
          json: {
            code: "schedule_unavailable",
            message: "Schedule unavailable",
          },
        });
      }
      return route.fulfill({
        json: empty
          ? []
          : [
              {
                sourceType: "CLASS_SESSION",
                sourceId: "class-session",
                title: "Assigned group class",
                classId: 1,
                roomId: 1,
                startAtUtc: "2030-10-02T18:00:00Z",
                endAtUtc: "2030-10-02T19:30:00Z",
                status: "SCHEDULED",
                participants: [
                  { memberId: "member-1", memberName: "Member A" },
                ],
              },
            ],
      });
    }
    if (path === "/api/coaches/me/pt-sessions") {
      expect(sportId).toBe(2);
      expect(url.searchParams.get("fromUtc")).toBe("2030-10-02T17:00:00.000Z");
      expect(url.searchParams.get("toUtc")).toBe("2030-10-09T17:00:00.000Z");
      return route.fulfill({
        json: empty
          ? []
          : [
              {
                sessionId: "pt-session",
                memberId: "pt-member",
                memberName: "Assigned PT member",
                roomId: null,
                startAtUtc: "2030-10-03T03:00:00Z",
                endAtUtc: "2030-10-03T04:30:00Z",
                status: "SCHEDULED",
              },
            ],
      });
    }
    return route.fulfill({
      status: 404,
      json: { message: "Unexpected fixture request: " + path },
    });
  });
  return calls;
}

for (const sportId of [3, 4, 2])
  for (const language of ["en", "vi"] as const) {
    test(`Coach dashboard uses scoped schedule: sport ${sportId}, ${language}`, async ({
      page,
    }) => {
      const calls = await fixture(page, { sportId, language });
      await page.goto("/coach");
      const upcoming = page.locator("section.card").filter({
        has: page.getByRole("heading", {
          name:
            language === "en"
              ? "Upcoming Classes & Training Sessions"
              : "Lịch giảng dạy & Ca tập sắp tới",
          exact: true,
        }),
      });
      await expect(
        upcoming.getByRole("cell", { name: /Assigned group class/ }),
      ).toBeVisible();
      await expect(
        upcoming.getByRole("cell", { name: "Assigned court", exact: true }),
      ).toBeVisible();
      const today = page.locator(".stat").filter({
        hasText: language === "en" ? "Sessions Today" : "Ca dạy hôm nay",
      });
      await expect(today.locator(".stat__value")).toHaveText(
        sportId === 2 ? "2" : "1",
      );
      if (sportId === 2) {
        await expect(
          upcoming.getByRole("cell", { name: /Assigned PT member/ }),
        ).toBeVisible();
        await upcoming
          .getByRole("button", { name: /Personal Training/ })
          .click();
        await expect(
          upcoming.getByRole("cell", { name: /Assigned group class/ }),
        ).toHaveCount(0);
        await expect(
          upcoming.getByRole("cell", { name: /Assigned PT member/ }),
        ).toBeVisible();
      }
      await page
        .getByTitle(
          language === "en" ? "Switch to Vietnamese" : "Chuyển sang tiếng Anh",
        )
        .click();
      await expect(
        page.getByRole("heading", {
          name:
            language === "en"
              ? "Lịch giảng dạy & Ca tập sắp tới"
              : "Upcoming Classes & Training Sessions",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      expect(
        calls.filter((c) => c.includes("/api/coaches/me/pt-sessions")).length,
      ).toBe(sportId === 2 ? 1 : 0);
      expect(
        calls.some(
          (c) =>
            c.includes("/api/class-sessions/mine") ||
            c.includes("/api/manager/court-schedule"),
        ),
      ).toBe(false);
      expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
      await expect(
        page.locator('tbody a[href^="/coach/attendance"]'),
      ).toHaveCount(0);
    });
  }

for (const language of ["en", "vi"] as const)
  test(`Empty coach dashboard is not an HTTP error: ${language}`, async ({
    page,
  }) => {
    await fixture(page, { sportId: 2, language, empty: true });
    await page.goto("/coach");
    await expect(
      page.getByText(
        language === "en"
          ? "You have no teaching sessions assigned in the next 7 days."
          : "Bạn chưa có ca giảng dạy nào được phân công trong 7 ngày tới.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

test("Coach schedule API failure stays visible and can be retried", async ({
  page,
}) => {
  await fixture(page, { failOnce: true });
  await page.goto("/coach");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Schedule unavailable",
  );
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(
    page.getByRole("cell", { name: /Assigned group class/ }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";

// HTTP fixtures validate frontend behavior; real authorization is tested by the backend.
const coachId = "00000000-0000-4000-8000-000000000001";

async function fixture(
  page: Page,
  {
    sportIds,
    language = "en",
    classes = [
      {
        classId: 7,
        code: "BADMINTON-07",
        name: "Assigned group class",
        sportId: 3,
        sportName: "Badminton",
        coachId,
        coachName: "Test Coach",
        defaultRoomId: 1,
        defaultRoomName: "Court 1",
        startDate: "2030-10-09",
        numSessions: 1,
        capacity: 12,
        price: 100000,
        status: "PUBLISHED",
      },
    ],
    failOnce = false,
  }: {
    sportIds: number[];
    language?: "en" | "vi";
    classes?: unknown[];
    failOnce?: boolean;
  },
) {
  const calls: string[] = [];
  let failed = false;
  await page.clock.install({ time: new Date("2030-10-09T02:00:00Z") });
  await page.addInitScript((language) => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", language);
  }, language);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(request.method() + " " + path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: coachId,
          email: "coach@example.com",
          fullName: "Test Coach",
          role: "COACH",
          sportIds,
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 4,
            name: "Basketball",
            code: "basketball",
            services: [
              {
                serviceType: "GROUP_COURSE",
                isEnabled: true,
                defaultSessionMinutes: null,
                defaultMaxCapacity: null,
              },
            ],
            isActive: true,
          },
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
    if (path.includes("notifications"))
      return route.fulfill({
        json: path.endsWith("unread-count") ? { count: 0 } : [],
      });
    if (path === "/api/rooms") return route.fulfill({ json: [] });
    if (path === "/api/coach-member-relationships")
      return route.fulfill({ json: [] });
    if (path === "/api/coaches/me/classes") {
      if (failOnce && !failed) {
        failed = true;
        return route.fulfill({
          status: 500,
          json: {
            error: "classes_unavailable",
            message: "Classes unavailable",
          },
        });
      }
      return route.fulfill({ json: classes });
    }
    if (/^\/api\/classes\/\d+\/sessions$/.test(path)) {
      const classId = Number(path.split("/")[3]);
      return route.fulfill({
        json: classes
          .filter((item) => (item as { classId: number }).classId === classId)
          .map((item) => {
            const course = item as {
              classId: number;
              name: string;
              status: string;
            };
            return {
              sessionId: "00000000-0000-4000-8000-000000000007",
              sessionNo: 1,
              classId: course.classId,
              className: course.name,
              roomId: 1,
              roomName: "Court 1",
              startAtUtc: "2030-10-09T10:00:00Z",
              endAtUtc: "2030-10-09T11:30:00Z",
              coachId,
              coachName: "Test Coach",
              status: "SCHEDULED",
              isMakeup: false,
            };
          }),
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
  return calls;
}

for (const language of ["en", "vi"] as const)
  for (const sportIds of [[3], [3, 4]])
    test(`Coach opens schedule then assigned class cards, sports ${sportIds}, ${language}`, async ({
      page,
    }) => {
      const calls = await fixture(page, { sportIds, language });
      await page.goto("/coach");
      await expect(page).toHaveURL(/\/coach\/schedule$/);
      await expect(
        page.getByRole("button").filter({ hasText: "Assigned group class" }),
      ).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      await page.locator('nav a[href="/coach/classes"]').click();
      await expect(page).toHaveURL(/\/coach\/classes$/);
      await expect(
        page.getByText("Assigned group class", { exact: true }),
      ).toBeVisible();
      await expect(page.locator('main a[href="/coach/classes/7"]')).toHaveCount(
        1,
      );
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      expect(calls).toContain("GET /api/coaches/me/classes");
      expect(calls).toContain("GET /api/classes/7/sessions");
      expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
    });

for (const language of ["en", "vi"] as const)
  test(`Empty coach schedule is not an HTTP error: ${language}`, async ({
    page,
  }) => {
    await fixture(page, { sportIds: [3], language, classes: [] });
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/coach\/schedule$/);
    await expect(
      page.getByText(/No classes assigned yet|Chưa có lớp được phân công/),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("cell")).toHaveCount(0);
  });

test("Coach classes API failure stays visible and can be retried", async ({
  page,
}) => {
  await fixture(page, { sportIds: [3], failOnce: true });
  await page.goto("/coach");
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "Classes unavailable",
  );
  await page.getByRole("button", { name: /Retry/ }).first().click();
  await expect(
    page.getByRole("button").filter({ hasText: "Assigned group class" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

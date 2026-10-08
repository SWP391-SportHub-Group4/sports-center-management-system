import { expect, test, type Page } from "@playwright/test";

// HTTP fixtures validate frontend behavior only; the schedule itself lives on /coach/schedule.

async function fixture(
  page: Page,
  {
    sportIds,
    language = "en",
    classes = [
      {
        classId: 7,
        name: "Assigned group class",
        sportName: "Cầu lông",
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
          userId: "00000000-0000-0000-0000-000000000001",
          email: "coach@example.com",
          fullName: "Test Coach",
          role: "COACH",
          sportIds,
          isPersonalTrainer: sportIds.includes(2),
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 2,
            name: "Personal training",
            code: "gym",
            services: [
              {
                serviceType: "PERSONAL_TRAINING",
                isEnabled: true,
                defaultSessionMinutes: null,
                defaultMaxCapacity: null,
              },
            ],
            isActive: true,
          },
          {
            sportId: 3,
            name: "Cầu lông",
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
    if (path === "/api/coaches/me/pt-sessions")
      return route.fulfill({ json: [] });
    if (path === "/api/coaches/me/court-schedule") {
      if (failOnce && !failed) {
        failed = true;
        return route.fulfill({
          status: 500,
          json: { code: "classes_unavailable", message: "Classes unavailable" },
        });
      }
      return route.fulfill({
        json: classes.map((item, index) => {
          const course = item as { classId: number; name: string; status: string };
          return {
            sourceType: "CLASS_SESSION",
            sourceId: `session-${index}`,
            classId: course.classId,
            roomId: null,
            startAtUtc: "2030-10-09T10:00:00Z",
            endAtUtc: "2030-10-09T11:00:00Z",
            coachId: "00000000-0000-0000-0000-000000000001",
            coachName: "Test Coach",
            title: course.name,
            status: course.status,
            participants: [],
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
  for (const sportIds of [[3], [2, 3]])
    test(`Coach overview lists own classes with read-only roster link, sports ${sportIds}, ${language}`, async ({
      page,
    }) => {
      const calls = await fixture(page, { sportIds, language });
      await page.goto("/coach");
      await expect(
        page.getByRole("cell", { name: "Assigned group class" }),
      ).toBeVisible();
      await expect(
        page.locator('tbody a[href="/coach/classes/7"]'),
      ).toHaveCount(1);
      // PT result/plan shortcuts only for coaches holding the PT specialty.
      const ptOnly = page.locator(
        'main a[href="/coach/progress"], main a[href="/coach/training-plans"]',
      );
      await expect(ptOnly).toHaveCount(sportIds.includes(2) ? 2 : 0);
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
    });

for (const language of ["en", "vi"] as const)
  test(`Empty coach overview is not an HTTP error: ${language}`, async ({
    page,
  }) => {
    await fixture(page, { sportIds: [3], language, classes: [] });
    await page.goto("/coach");
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
    page.getByRole("cell", { name: "Assigned group class" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

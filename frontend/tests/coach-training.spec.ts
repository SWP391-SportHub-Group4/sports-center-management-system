import { expect, test, type Page } from "@playwright/test";

const coachId = "33333333-3333-4333-8333-333333333333";
async function coachFixture(
  page: Page,
  sportIds: number[],
  isPersonalTrainer = false,
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "coach-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: coachId,
          fullName: "Coach",
          email: "coach@example.com",
          role: "COACH",
          sportIds,
          isPersonalTrainer,
        },
      });
    if (path === "/api/sports")
      return route.fulfill({
        json: [
          {
            sportId: 1,
            name: "Gym",
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
    if (path === "/api/coaches/me/classes") return route.fulfill({ json: [] });
    if (path === "/api/coaches/me/teaching/students")
      return route.fulfill({
        json: { items: [], sports: [], totalCount: 0, page: 1, pageSize: 12 },
      });
    if (path === "/api/coaches/me/students")
      return route.fulfill({
        json: { items: [], totalCount: 0, page: 1, pageSize: 12 },
      });
    if (path === "/api/coach-member-relationships")
      return route.fulfill({ json: [] });
    if (path.endsWith("/pt-entitlements") || path.includes("/pt-sessions"))
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { code: "fixture_missing", message: path },
    });
  });
}

test("coach with an old PT qualification sees only group teaching navigation", async ({
  page,
}) => {
  await coachFixture(page, [1, 3], true);
  await page.goto("/coach");
  const navbar = page.getByRole("navigation");
  await expect(
    navbar.getByRole("link", { name: "PT schedule", exact: true }),
  ).toHaveCount(0);
  await expect(
    navbar.getByRole("link", { name: "Teaching schedule", exact: true }),
  ).toBeVisible();

  await navbar.getByRole("link", { name: "Teaching schedule", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/schedule$/);
  await expect(page.getByRole("heading", { name: "Ready for your next PT session" })).toHaveCount(0);

  await navbar
    .getByRole("link", { name: "Students", exact: true })
    .click();
  await expect(page).toHaveURL(/\/coach\/members$/);
  await expect(
    page.getByRole("heading", { name: "Your students", exact: true }),
  ).toBeVisible();
});

test("group-only coach uses a single navbar for teaching, classes and students", async ({
  page,
}) => {
  await coachFixture(page, [3]);
  await page.goto("/coach");
  const navbar = page.getByRole("navigation");
  await expect(
    page.getByRole("link", { name: "PT schedule", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Teaching schedule", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Assigned classes", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Students", exact: true }),
  ).toHaveCount(1);

  await navbar
    .getByRole("link", { name: "Teaching schedule", exact: true })
    .click();
  await expect(page).toHaveURL(/\/coach\/schedule$/);
  await navbar
    .getByRole("link", { name: "Assigned classes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/coach\/classes$/);
  await navbar.getByRole("link", { name: "Students", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/members$/);
  await expect(
    page.getByRole("heading", { name: "Your students", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No matching students", { exact: true }),
  ).toBeVisible();
});

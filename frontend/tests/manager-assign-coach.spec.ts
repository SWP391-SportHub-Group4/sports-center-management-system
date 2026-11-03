import { expect, test } from "@playwright/test";

test("coach details show main and substitute class assignments without manual member relationships", async ({
  page,
}) => {
  const coachId = "44444444-4444-4444-8444-444444444444";
  const queries: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "manager-fixture"),
  );
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    let json: unknown = [];
    if (url.pathname === "/api/users/me")
      json = {
        userId: "manager",
        role: "CENTER_MANAGER",
        fullName: "Manager",
        sportIds: [],
      };
    else if (url.pathname === "/api/manager/coaches/" + coachId)
      json = {
        userId: coachId,
        fullName: "Basketball Coach",
        email: "coach@example.com",
        status: "ACTIVE",
        sportIds: [4],
      };
    else if (url.pathname === "/api/manager/classes") {
      queries.push(url.searchParams.get("coachId") ?? "");
      json = {
        items: [
          { classId: 1, name: "Primary class", coachId, status: "IN_PROGRESS" },
          {
            classId: 2,
            name: "Substitute session class",
            coachId: "another-coach",
            status: "PUBLISHED",
          },
          { classId: 3, name: "Finished class", coachId, status: "COMPLETED" },
          { classId: 4, name: "Cancelled class", coachId, status: "CANCELLED" },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 4,
      };
    } else if (url.pathname === "/api/manager/sports")
      json = [{ sportId: 4, name: "Basketball" }];
    return route.fulfill({ json });
  });
  await page.goto("/manager/coaches/" + coachId + "?tab=classes");
  await expect(page.getByRole("link", { name: /Primary class/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Substitute session class/ }),
  ).toBeVisible();
  expect(queries).toContain(coachId);
  await expect(page.locator('a[href^="/manager/classes/"]')).toHaveText([
    /Primary class.*In progress/,
    /Substitute session class.*Published/,
    /Finished class.*Completed/,
    /Cancelled class.*Cancelled/,
  ]);
  await expect(
    page.getByRole("button", { name: "Assign coach", exact: true }),
  ).toHaveCount(0);
});

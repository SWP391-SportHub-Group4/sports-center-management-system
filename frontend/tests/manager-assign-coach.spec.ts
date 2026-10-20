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
          { classId: 1, name: "Primary class", coachId },
          {
            classId: 2,
            name: "Substitute session class",
            coachId: "another-coach",
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 2,
      };
    } else if (url.pathname === "/api/manager/sports")
      json = [{ sportId: 4, name: "Basketball" }];
    return route.fulfill({ json });
  });
  await page.goto("/manager/coaches/" + coachId + "?tab=classes");
  await expect(
    page.getByRole("link", { name: "Primary class", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Substitute session class", exact: true }),
  ).toBeVisible();
  expect(queries).toContain(coachId);
  await expect(
    page.getByRole("button", { name: "Assign coach", exact: true }),
  ).toHaveCount(0);
});

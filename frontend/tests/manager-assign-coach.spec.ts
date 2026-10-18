import { expect, test } from "@playwright/test";

const memberId = "22222222-2222-4222-8222-222222222222";

for (const scenario of ["success", "no classes", "stale assignment"] as const) {
  test(`Manager assigns coach: ${scenario}`, async ({ page }) => {
    let created = false;
    let posts = 0;
    const relationship = {
      relationshipId: "existing",
      coachId: "coach-a",
      coachName: "Assigned coach",
      memberId,
      sourceType: "CLASS_BASED",
      status: "ACTIVE",
      activeClasses: [],
    };
    await page.addInitScript(() =>
      localStorage.setItem(
        "sporthub.accessToken",
        "manager-assignment-fixture",
      ),
    );
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "manager",
            role: "CENTER_MANAGER",
            fullName: "Manager",
            email: "manager@example.com",
            sportIds: [],
          },
        });
      if (path.endsWith("/unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === `/api/users/${memberId}`)
        return route.fulfill({
          json: {
            userId: memberId,
            fullName: "Desk member",
            email: "member@example.com",
            role: "MEMBER",
            status: "ACTIVE",
            sportIds: [],
          },
        });
      if (path === `/api/members/${memberId}/enrollments`) {
        const enrollment = {
          classId: 42,
          className: "Current badminton",
          sportId: 3,
          sportName: "Badminton",
          coachId: "coach-b",
          coachName: "Eligible coach",
          status: "CONFIRMED",
          classStatus: "IN_PROGRESS",
        };
        if (scenario !== "no classes" && url.searchParams.get("page") === "1")
          return route.fulfill({
            json: {
              items: Array.from({ length: 100 }, () => ({
                ...enrollment,
                status: "REFUNDED",
              })),
              page: 1,
              pageSize: 100,
              totalCount: 107,
            },
          });
        const items =
          scenario === "no classes"
            ? []
            : [
                enrollment,
                {
                  ...enrollment,
                  classId: 43,
                  className: "Upcoming badminton",
                  classStatus: "PUBLISHED",
                },
                {
                  ...enrollment,
                  coachId: "coach-a",
                  coachName: "Assigned coach",
                },
                {
                  ...enrollment,
                  coachId: "coach-c",
                  coachName: "Refunded coach",
                  status: "REFUNDED",
                },
                {
                  ...enrollment,
                  coachId: "coach-d",
                  coachName: "Finished coach",
                  classStatus: "COMPLETED",
                },
                {
                  ...enrollment,
                  classId: 44,
                  className: "Current basketball",
                  sportId: 4,
                  sportName: "Basketball",
                  coachId: "coach-e",
                  coachName: "Basketball coach",
                },
                {
                  ...enrollment,
                  classId: 45,
                  className: "Assigned basketball",
                  sportId: 4,
                  sportName: "Basketball",
                  coachId: "coach-a",
                  coachName: "Assigned coach",
                },
              ];
        return route.fulfill({
          json: {
            items,
            page: scenario === "no classes" ? 1 : 2,
            pageSize: 100,
            totalCount: scenario === "no classes" ? 0 : 107,
          },
        });
      }
      if (path === "/api/coach-member-relationships") {
        if (route.request().method() === "POST") {
          posts++;
          expect(route.request().postDataJSON()).toEqual({
            coachId: "coach-b",
            memberId,
            sourceType: "ASSIGNED_BY_MANAGER",
            note: "Reviewed shared classes",
          });
          created = true;
          if (scenario === "stale assignment")
            return route.fulfill({
              status: 409,
              json: {
                error: "relationship_already_active",
                message: "Relationship already active.",
              },
            });
          return route.fulfill({
            status: 201,
            json: { ...relationship, coachId: "coach-b" },
          });
        }
        return route.fulfill({
          json: [
            relationship,
            ...(created
              ? [
                  {
                    ...relationship,
                    relationshipId: "new",
                    coachId: "coach-b",
                    coachName: "Eligible coach",
                    sourceType: "ASSIGNED_BY_MANAGER",
                    activeClasses: [
                      { classId: 42, className: "Current badminton" },
                    ],
                  },
                ]
              : []),
          ],
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto(`/manager/members/${memberId}`);
    await page
      .getByRole("button", { name: "Assign coach", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const submit = dialog.getByRole("button", { name: "Confirm assignment" });
    await expect(submit).toBeDisabled();
    if (scenario === "no classes") {
      await expect(dialog).toContainText("no eligible shared classes");
      await expect(dialog.getByRole("combobox")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(posts).toBe(0);
      return;
    }
    const select = dialog.getByRole("combobox", { name: "Coach" });
    await expect(select.locator('option[value="coach-a"]')).toHaveAttribute(
      "disabled",
      "",
    );
    await expect(select.locator('option[value="coach-c"]')).toHaveCount(0);
    await expect(select.locator('option[value="coach-d"]')).toHaveCount(0);
    await select.selectOption("coach-b");
    await expect(dialog).toContainText("Current badminton");
    await expect(dialog).toContainText("Upcoming badminton");
    const sport = dialog.getByRole("combobox", { name: "Sport", exact: true });
    await sport.selectOption("4");
    await expect(select).toHaveValue("");
    await expect(submit).toBeDisabled();
    await expect(select.locator('option[value="coach-b"]')).toHaveCount(0);
    await expect(select.locator('option[value="coach-e"]')).toContainText(
      "Basketball",
    );
    await expect(select.locator('option[value="coach-a"]')).toHaveAttribute(
      "disabled",
      "",
    );
    await sport.selectOption("3");
    await expect(select.locator('option[value="coach-e"]')).toHaveCount(0);
    await select.selectOption("coach-b");
    await expect(dialog).toContainText("Current badminton — Badminton");
    await dialog
      .getByRole("textbox", { name: "Note (optional)" })
      .fill("Reviewed shared classes");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/manager-assign-coach-${scenario}.png`,
      fullPage: true,
    });
    await submit.click();
    expect(posts).toBe(1);
    if (scenario === "stale assignment") {
      await expect(dialog).toContainText("Relationship already active.");
      await expect(select.locator('option[value="coach-b"]')).toHaveAttribute(
        "disabled",
        "",
      );
      await expect(submit).toBeDisabled();
    } else {
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText("Eligible coach", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Assigned by Manager", { exact: true }),
      ).toBeVisible();
    }
  });
}

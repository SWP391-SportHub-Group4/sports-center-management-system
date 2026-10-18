import { expect, test } from "@playwright/test";

for (const failFirst of [false, true]) {
  test(`Manager ends one relationship and preserves the others (${failFirst ? "retry" : "success"})`, async ({
    page,
  }) => {
    const memberId = "22222222-2222-4222-8222-222222222222";
    let posts = 0;
    let ended = false;
    const pair = {
      relationshipId: "current",
      coachId: "coach-a",
      coachName: "Current coach",
      memberId,
      sourceType: "ASSIGNED_BY_MANAGER",
      status: "ACTIVE",
      activeClasses: [{ classId: 42, className: "Current basketball" }],
    };
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "manager-end-fixture"),
    );
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
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
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === `/api/users/${memberId}`)
        return route.fulfill({
          json: {
            userId: memberId,
            fullName: "Desk member",
            email: "member@example.com",
            status: "ACTIVE",
            sportIds: [],
          },
        });
      if (path === "/api/coach-member-relationships/current/end") {
        posts++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({
          reason: "Member requested ending",
        });
        if (failFirst && posts === 1)
          return route.fulfill({
            status: 500,
            json: {
              error: "server_error",
              message: "Could not save. Try again.",
            },
          });
        ended = true;
        return route.fulfill({ json: { ...pair, status: "ENDED" } });
      }
      if (path === "/api/coach-member-relationships")
        return route.fulfill({
          json: [
            {
              ...pair,
              status: ended ? "ENDED" : "ACTIVE",
              endedAt: ended ? "2026-10-18T05:00:00Z" : null,
              endReason: ended ? "Member requested ending" : null,
              activeClasses: ended ? [] : pair.activeClasses,
            },
            {
              ...pair,
              relationshipId: "other",
              coachId: "coach-b",
              coachName: "Other coach",
            },
            {
              ...pair,
              relationshipId: "old",
              coachId: "coach-c",
              coachName: "Former coach",
              status: "ENDED",
              endReason: "Class completed",
              activeClasses: [],
            },
          ],
        });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/manager/members/${memberId}`);
    await expect(
      page.getByRole("button", { name: /^End relationship with/ }),
    ).toHaveCount(2);
    await page
      .getByRole("button", {
        name: "End relationship with Current coach",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", { name: "End coach relationship" });
    await expect(dialog).toContainText(
      "stays enrolled and keeps their current schedule",
    );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(posts).toBe(0);
    await page
      .getByRole("button", {
        name: "End relationship with Current coach",
        exact: true,
      })
      .click();
    const reason = dialog.getByRole("textbox", { name: "Ending reason" });
    const confirm = dialog.getByRole("button", { name: "Confirm ending" });
    await reason.fill("   ");
    await expect(confirm).toBeDisabled();
    await reason.fill("  Member requested ending  ");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/end-relationship-${failFirst}.png`,
      fullPage: true,
    });
    await confirm.click();
    if (failFirst) {
      await expect(dialog).toContainText("Could not save. Try again.");
      await expect(reason).toHaveValue("  Member requested ending  ");
      await confirm.click();
    }
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Member requested ending", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "End relationship with Current coach",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "End relationship with Other coach",
        exact: true,
      }),
    ).toBeVisible();
  });
}

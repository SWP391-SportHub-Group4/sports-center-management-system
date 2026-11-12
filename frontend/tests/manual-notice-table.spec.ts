import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`Manual notices selects recipients in a table and sends directly from the popup at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "notice-fixture");
      localStorage.setItem("sporthub_lang", "en");
    });
    const posts: Record<string, unknown>[] = [];
    const keys: string[] = [];
    let attempts = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
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
      if (path.endsWith("recipient-filters"))
        return route.fulfill({
          json: {
            classes: [{ classId: 1, name: "Badminton", code: "BAD01" }],
            specialties: [{ sportId: 1, name: "Badminton" }],
          },
        });
      if (path.endsWith("recipient-options")) {
        const role = url.searchParams.get("role")!;
        return route.fulfill({
          json: {
            items: [
              {
                userId: role,
                name: role === "MEMBER" ? "Alex Member" : role,
                email: role.toLowerCase() + "@example.com",
                avatarUrl: null,
              },
            ],
            page: 1,
            pageSize: 100,
            totalCount: 1,
          },
        });
      }
      if (
        path === "/api/manager/notices" &&
        route.request().method() === "POST"
      ) {
        posts.push(route.request().postDataJSON());
        keys.push(route.request().headers()["idempotency-key"]);
        attempts++;
        if (attempts === 1) return route.abort("failed");
        return route.fulfill({
          json: { noticeId: "77777777-7777-4777-8777-777777777777" },
        });
      }
      if (path.includes("/notices/by-key/"))
        return route.fulfill({
          status: 404,
          json: { error: "not_found", message: "Not found" },
        });
      return route.fulfill({ json: [] });
    });
    await page.goto("/manager/notices");
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(page.getByLabel("Subject", { exact: true })).toHaveCount(0);
    await page.getByLabel("Role", { exact: true }).selectOption("MEMBER");
    await page
      .getByLabel("Name or email", { exact: true })
      .fill("member@example.com");
    const selectAll = page.getByRole("checkbox", {
      name: "Select all recipients",
      exact: true,
    });
    await selectAll.check();
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Member", exact: true }),
    ).toBeChecked();
    await selectAll.uncheck();
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Member", exact: true }),
    ).not.toBeChecked();
    await selectAll.check();
    await page
      .getByRole("button", { name: "Send notice (1)", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Manual notices",
      exact: true,
    });
    await dialog.getByLabel("Subject", { exact: true }).fill("Schedule update");
    await dialog
      .getByLabel("Message", { exact: true })
      .fill("Your class schedule has changed.");
    await expect(
      dialog.getByRole("button", { name: "Review", exact: true }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Send notice (1)", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Manual notices", exact: true });
    await expect(dialog.getByLabel("Subject", { exact: true })).toHaveValue(
      "Schedule update",
    );
    await page.screenshot({
      path: testInfo.outputPath("manual-notice-popup.png"),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => posts.length).toBe(1);
    await dialog.getByRole("button", { name: /retry/i }).click();
    await expect(
      page.getByRole("dialog", { name: "Success", exact: true }),
    ).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual(posts[1]);
    expect(keys[0]).toBe(keys[1]);
    await page
      .getByRole("dialog", { name: "Success", exact: true })
      .screenshot({
        path: testInfo.outputPath("notice-success.png"),
        animations: "disabled",
      });
    expect(posts[0]).toMatchObject({
      subject: "Schedule update",
      message: "Your class schedule has changed.",
      recipientUserIds: ["MEMBER"],
      sendEmail: true,
      sendInApp: true,
    });
    await page
      .getByRole("dialog", { name: "Success", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("manual-notice-table.png"),
      animations: "disabled",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

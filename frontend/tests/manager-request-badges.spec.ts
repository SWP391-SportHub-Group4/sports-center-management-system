import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page, initialCount = 5) {
  let unread = initialCount;
  const reads: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "manager-request-badges"),
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
      return route.fulfill({ json: { count: 2 } });
    if (path === "/api/manager/requests/summary")
      return route.fulfill({
        json: { coach: initialCount, refunds: 0, support: 0, unread },
      });
    if (path === "/api/manager/requests/coach/request-1/read") {
      expect(route.request().method()).toBe("POST");
      if (!reads.length) unread--;
      reads.push(path);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/class-session-change-requests/filters"))
      return route.fulfill({ json: { classes: [], coaches: [] } });
    if (path === "/api/manager/class-session-change-requests")
      return route.fulfill({
        json: {
          items: [
            {
              requestId: "request-1",
              sessionId: "session-1",
              classId: 1,
              className: "Badminton foundations",
              sportId: 3,
              sessionNo: 1,
              coachId: "coach",
              coachName: "Alex Nguyen",
              type: "ABSENCE",
              reason: "Cannot attend this session",
              status: "PENDING",
              originalStartAtUtc: "2032-11-01T01:00:00Z",
              originalEndAtUtc: "2032-11-01T02:00:00Z",
              originalRoomId: 7,
              createdAtUtc: "2032-10-01T01:00:00Z",
              proposedStartAtUtc: null,
              proposedEndAtUtc: null,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 50,
        },
      });
    if (path === "/api/manager/classes/1")
      return route.fulfill({
        json: {
          classId: 1,
          name: "Badminton foundations",
          sportId: 3,
          coachId: "coach",
          confirmedCount: 5,
          capacity: 12,
          status: "PUBLISHED",
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/requests");
  return reads;
}

test("both badges update after reading and persist after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const reads = await fixture(page);
  const exceptions = page.getByRole("button", { name: /^Exception/ });
  await expect(exceptions.getByLabel("5 unread requests")).toBeVisible();
  await exceptions.click();
  await expect(
    page
      .getByRole("link", { name: /^Request / })
      .getByLabel("5 unread requests"),
  ).toBeVisible();
  expect(reads).toHaveLength(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /Badminton foundations.*Session 1/ })
    .click();
  await expect(exceptions.getByLabel("4 unread requests")).toBeVisible();
  await page.keyboard.press("Escape");
  await exceptions.click();
  await expect(
    page
      .getByRole("link", { name: /^Request / })
      .getByLabel("4 unread requests"),
  ).toBeVisible();
  expect(reads).toHaveLength(1);
  await page.reload();
  await expect(exceptions.getByLabel("4 unread requests")).toBeVisible();
});

test("99+ badges work in desktop dropdown and mobile navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await fixture(page, 125);
  const exceptions = page.getByRole("button", { name: /^Exception/ });
  await expect(exceptions.getByLabel("125 unread requests")).toHaveText("99+");
  await exceptions.click();
  await expect(
    page
      .getByRole("link", { name: /^Request / })
      .getByLabel("125 unread requests"),
  ).toHaveText("99+");
  await page.screenshot({ path: "test-results/request-badges-desktop.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(
    page.getByLabel("125 unread requests").filter({ visible: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/request-badges-mobile.png" });
});

test("zero unread hides both badges", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await fixture(page, 1);
  const exceptions = page.getByRole("button", { name: /^Exception/ });
  await expect(exceptions.getByLabel("1 unread requests")).toBeVisible();
  await page
    .getByRole("button", { name: /Badminton foundations.*Session 1/ })
    .click();
  await expect(exceptions.locator("span")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await exceptions.click();
  await expect(
    page.getByRole("link", { name: "Request", exact: true }).locator("span"),
  ).toHaveCount(0);
});

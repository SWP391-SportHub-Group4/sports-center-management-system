import { expect, test, type Page } from "@playwright/test";

async function fixture(
  page: Page,
  options: { status?: string; empty?: boolean; conflict?: boolean } = {},
) {
  let changed = false;
  let conflicted = false;
  const writes: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "lead-coach-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path.endsWith("/lead-coach/candidates"))
      return route.fulfill({
        json: {
          version: 3,
          currentCoachId: "old-coach",
          remainingSessionCount: 3,
          coaches:
            options.empty || conflicted
              ? []
              : [
                  { coachId: "new-coach", fullName: "Jamie Tran" },
                  { coachId: "other-coach", fullName: "Taylor Nguyen" },
                ],
        },
      });
    if (path.endsWith("/lead-coach")) {
      writes.push(route.request().postDataJSON());
      if (options.conflict) {
        conflicted = true;
        return route.fulfill({
          status: 409,
          json: {
            error: "coach_busy",
            message: "This coach is no longer available. Choose another coach.",
          },
        });
      }
      changed = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/manager/classes/42")
      return route.fulfill({
        json: {
          classId: 42,
          code: "BD-042",
          name: "Badminton foundations",
          status: options.status ?? "PUBLISHED",
          sportId: 1,
          sportName: "Badminton",
          roomName: "Court A",
          coachId: changed ? "new-coach" : "old-coach",
          coachName: changed ? "Jamie Tran" : "Alex Nguyen",
          capacity: 20,
          confirmedCount: 12,
          reservedCount: 12,
          activeHoldCount: 0,
          availableSeats: 8,
          price: 1200000,
          costAmount: 0,
          numSessions: 3,
          startDate: "2032-11-01",
          createdAt: "2026-10-01T01:00:00Z",
          publishedAt: "2026-10-02T01:00:00Z",
          version: changed ? 4 : 3,
          enrollmentOpen: true,
          thresholdStatus: "MET",
          breakEvenThreshold: 0,
        },
      });
    if (path === "/api/classes/42/sessions")
      return route.fulfill({
        json: [
          {
            sessionId: "session-42",
            sessionNo: 1,
            classId: 42,
            status: "SCHEDULED",
            roomName: "Court A",
            coachName: changed ? "Jamie Tran" : "Alex Nguyen",
            startAtUtc: "2032-11-01T01:00:00Z",
            endAtUtc: "2032-11-01T02:00:00Z",
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/classes/42?tab=sessions");
  return writes;
}

test("manager selects an eligible coach and refreshes class and sessions", async ({
  page,
}) => {
  const writes = await fixture(page, { status: "IN_PROGRESS" });
  await page
    .getByRole("button", { name: "Change Lead Coach", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Select New Lead Coach" });
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
  await dialog
    .getByRole("searchbox", { name: "Search coaches by name" })
    .fill("Jamie");
  await expect(dialog.getByRole("radio")).toHaveCount(1);
  await dialog.getByRole("radio").check();
  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Cover the remaining class sessions");
  await page.screenshot({
    path: "test-results/lead-coach-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Confirm Change" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/lead-coach-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Confirm Change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Lead coach changed." }),
  ).toBeVisible();
  await expect(
    page.locator("td").filter({ hasText: "Jamie Tran" }),
  ).toBeVisible();
  expect(writes).toEqual([
    {
      coachId: "new-coach",
      expectedVersion: 3,
      reason: "Cover the remaining class sessions",
    },
  ]);
});

test("empty candidates cannot submit; Escape restores button focus", async ({
  page,
}) => {
  await fixture(page, { empty: true });
  const trigger = page.getByRole("button", {
    name: "Change Lead Coach",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("heading", { name: "No eligible coaches available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("a new conflict refreshes candidates and prevents another stale submission", async ({
  page,
}) => {
  await fixture(page, { conflict: true });
  await page
    .getByRole("button", { name: "Change Lead Coach", exact: true })
    .click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Replace unavailable lead coach");
  await page.getByRole("button", { name: "Confirm Change" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("no longer available");
  await expect(
    page.getByRole("heading", { name: "No eligible coaches available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Change" }),
  ).toBeDisabled();
});

for (const status of ["DRAFT", "COMPLETED", "CANCELLED"]) {
  test(`change lead coach is hidden for ${status}`, async ({ page }) => {
    await fixture(page, { status });
    await expect(
      page.getByRole("heading", { name: "Badminton foundations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Change Lead Coach", exact: true }),
    ).toHaveCount(0);
  });
}

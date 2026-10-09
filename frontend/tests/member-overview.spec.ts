import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("member overview shows actionable data with clear session states", async ({
  page,
}) => {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  const at = (offsetDays: number, hour: number) =>
    new Date(
      Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+07:00`) +
        offsetDays * 86_400_000,
    ).toISOString();

  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/users/me")
      json = {
        userId: "member-1",
        email: "member@example.com",
        fullName: "Alex Member",
        role: "MEMBER",
      };
    else if (path === "/api/wallet/me")
      json = {
        ownerUserId: "member-1",
        availablePoints: 500,
        heldPoints: 0,
        vndPerPoint: 1000,
      };
    else if (path === "/api/members/me/schedule")
      json = [
        {
          sessionId: "class-present",
          classId: 1,
          className: "Badminton basics",
          sportName: "Badminton",
          startAtUtc: at(0, 9),
          endAtUtc: at(0, 10),
          roomName: "Court 1",
          status: "COMPLETED",
          attendanceStatus: "PRESENT",
        },
        {
          sessionId: "class-absent",
          classId: 2,
          className: "Morning drills",
          sportName: "Basketball",
          startAtUtc: at(0, 7),
          endAtUtc: at(0, 8),
          roomName: "Court 2",
          status: "COMPLETED",
          attendanceStatus: "ABSENT",
        },
      ];
    else if (path === "/api/members/me/pt-sessions")
      json = [
        {
          sessionId: "pt-next",
          coachName: "Coach Minh",
          startAtUtc: at(1, 10),
          endAtUtc: at(1, 11),
          status: "SCHEDULED",
          roomName: "Studio A",
        },
      ];
    else if (path === "/api/court-rentals/mine")
      json = [
        {
          courtRentalId: "rental-next",
          sportId: 1,
          startAtUtc: at(2, 16),
          endAtUtc: at(2, 17),
          status: "CONFIRMED",
        },
      ];
    else if (path === "/api/sports")
      json = [{ sportId: 1, name: "Basketball" }];
    else if (path === "/api/members/me/gym-checkins")
      json = {
        items: [
          {
            checkInId: "visit-1",
            checkInTime: at(0, 8),
            checkOutTime: at(0, 9),
          },
        ],
        totalCount: 1,
      };
    else if (path === "/api/members/me/workout-results")
      json = [
        {
          resultId: "result-1",
          coachComment: "Your footwork is getting steadier.",
          recordedAt: at(0, 12),
        },
      ];
    else if (path === "/api/class-threshold-responses/mine")
      json = [
        {
          responseId: "response-1",
          className: "Badminton basics",
          deadlineUtc: new Date(Date.now() + 6 * 3_600_000).toISOString(),
          choice: null,
          resolutionStatus: "PENDING",
        },
      ];
    else if (path === "/api/members/me/invoices")
      json = { items: [], totalCount: 0 };
    return route.fulfill({ json });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/member");
  await expect(
    page.getByRole("heading", { name: "Point wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View point history" }),
  ).toHaveAttribute("href", "/member/finance?tab=wallet");
  await expect(
    page.getByText("Your footwork is getting steadier."),
  ).toBeVisible();
  await expect(page.getByText("Gym walk-in")).toBeVisible();
  await expect(
    page.getByText("Respond within", { exact: false }),
  ).toBeVisible();
  await expect(page.locator('[data-kind="class"]')).toHaveCount(2);
  await expect(page.locator('[data-kind="pt"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="rental"]')).toHaveCount(1);
  await expect(page.locator('[data-state="present"]')).toHaveCount(2);
  await expect(page.locator('[data-state="absent"]')).toHaveCount(1);
  await expect(page.locator('[data-state="upcoming"]')).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "Quick actions" }).getByRole("link"),
  ).toHaveCount(3);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(
    page.getByRole("link", { name: "Point wallet: 500" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(321);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

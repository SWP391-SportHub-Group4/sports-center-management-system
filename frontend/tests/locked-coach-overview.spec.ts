import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page) {
  let leadChanged = false;
  let substituteChanged = false;
  const writes: { path: string; body: unknown }[] = [];
  const course = (id: number) => ({
    classId: id,
    name: id === 1 ? "Badminton foundations" : "Badminton advanced",
    code: `BD-00${id}`,
    sportId: 3,
    sportName: "Badminton",
    coachId: id === 1 && !leadChanged ? "locked-coach" : "other-lead",
    coachName: id === 1 && !leadChanged ? "Alex Nguyen" : "Taylor Nguyen",
    status: "PUBLISHED",
    capacity: 12,
    confirmedCount: 6,
    reservedCount: 6,
    availableSeats: 6,
    activeHoldCount: 0,
    version: 3,
    roomName: "Court A",
    startDate: "2032-11-01",
    numSessions: 3,
    price: 500000,
    costAmount: 0,
    thresholdStatus: "MET",
    enrollmentOpen: true,
  });
  const substitute = {
    sessionId: "substitute-session",
    classId: 2,
    sessionNo: 2,
    roomId: 7,
    roomName: "Court B",
    coachId: "locked-coach",
    startAtUtc: "2032-11-02T01:00:00Z",
    endAtUtc: "2032-11-02T02:00:00Z",
    isSubstitute: true,
  };
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "locked-coach-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() === "POST") {
      writes.push({ path, body: route.request().postDataJSON() });
      if (path === "/api/manager/classes/1/lead-coach") leadChanged = true;
      else if (path === "/api/class-sessions/substitute-session/reschedule")
        substituteChanged = true;
      else throw new Error(`Unexpected write: ${path}`);
      return route.fulfill({ status: 204 });
    }
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
    if (path === "/api/manager/coaches/locked-coach")
      return route.fulfill({
        json: {
          userId: "locked-coach",
          fullName: "Alex Nguyen",
          email: "alex@example.com",
          phone: "0901234567",
          status: "DEACTIVATED",
          sportIds: [3],
          title: "Badminton coach",
          yearsExperience: 7,
          bio: "Helping players build confident footwork and reliable technique.",
          philosophy:
            "Build strong foundations, then progress at each player's pace.",
        },
      });
    if (path === "/api/manager/sports")
      return route.fulfill({
        json: [{ sportId: 3, name: "Badminton", isActive: true, services: [] }],
      });
    if (path === "/api/manager/classes")
      return route.fulfill({
        json: {
          items: leadChanged ? [] : [course(1)],
          page: 1,
          pageSize: 20,
          totalCount: leadChanged ? 0 : 1,
        },
      });
    if (path === "/api/manager/classes/1" || path === "/api/manager/classes/2")
      return route.fulfill({ json: course(Number(path.split("/").at(-1))) });
    if (path === "/api/manager/coach-coverage")
      return route.fulfill({
        json:
          leadChanged && substituteChanged
            ? []
            : [
                {
                  coachId: "locked-coach",
                  mainClasses: leadChanged ? [] : [{ classId: 1 }],
                  sessions: [
                    ...(!leadChanged
                      ? [
                          {
                            ...substitute,
                            sessionId: "lead-session",
                            classId: 1,
                            isSubstitute: false,
                          },
                        ]
                      : []),
                    ...(!substituteChanged ? [substitute] : []),
                  ],
                },
              ],
      });
    if (path.endsWith("/lead-coach/candidates"))
      return route.fulfill({
        json: {
          version: 3,
          currentCoachId: "locked-coach",
          remainingSessionCount: 3,
          coaches: [{ coachId: "replacement", fullName: "Jamie Tran" }],
        },
      });
    if (path === "/api/availability/coaches") {
      expect(url.searchParams.get("excludeSessionId")).toBe(
        "substitute-session",
      );
      expect(url.searchParams.get("sportId")).toBe("3");
      expect(url.searchParams.get("startUtc")).toBe(substitute.startAtUtc);
      return route.fulfill({
        json: [{ coachId: "replacement", fullName: "Jamie Tran" }],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/coaches/locked-coach?tab=overview");
  return writes;
}

test("urgent overview separates lead classes and substitute sessions on desktop and mobile", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();
  await expect(
    page.getByText("This coach has a deactivated account.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Locked", { exact: true })).toHaveCount(0);
  const region = page.getByRole("region", {
    name: "Assignment, Class / session, Schedule affected, Action",
  });
  await expect(
    region.getByRole("button", { name: "Change Lead Coach", exact: true }),
  ).toHaveCount(1);
  await expect(
    region.getByRole("button", { name: "Change Session Coach", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Sessions still assigned to this coach", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "About this coach" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/coach-overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/coach-overview-mobile.png",
    fullPage: true,
  });
});

test("lead replacement uses the shared API and leaves substitute assignments visible", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page
    .getByRole("button", { name: "Change Lead Coach", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Select New Lead Coach" });
  await dialog.getByRole("radio").check();
  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Replace deactivated lead coach");
  await dialog.getByRole("button", { name: "Confirm Change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change Lead Coach", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change Session Coach", exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    {
      path: "/api/manager/classes/1/lead-coach",
      body: {
        coachId: "replacement",
        expectedVersion: 3,
        reason: "Replace deactivated lead coach",
      },
    },
  ]);
});

test("substitute replacement changes only its session using qualified available coaches", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page
    .getByRole("button", { name: "Change Session Coach", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Select New Session Coach" });
  await expect(dialog).toContainText(
    "The class lead coach, time and room stay the same.",
  );
  await dialog.getByRole("radio").check();
  await dialog
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Replace deactivated substitute coach");
  await dialog.getByRole("button", { name: "Confirm Change" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change Session Coach", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Change Lead Coach", exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    {
      path: "/api/class-sessions/substitute-session/reschedule",
      body: {
        startAtUtc: "2032-11-02T01:00:00Z",
        coachId: "replacement",
        reason: "Replace deactivated substitute coach",
      },
    },
  ]);
});

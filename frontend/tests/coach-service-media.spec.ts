import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const coachId = "33333333-3333-4333-8333-333333333333";
const courses = [
  "Badminton",
  "Basketball",
  "Tennis",
  "Badminton",
  "Basketball",
].map((sportName, index) => ({
  classId: index + 11,
  name: `${sportName} class ${index + 1}`,
  code: `COURSE-${index + 11}`,
  coachId,
  coachName: "Coach Alex",
  sportId: index + 1,
  sportName,
  defaultRoomId: 2,
  roomName: "Court 02",
  startDate: "2026-11-01",
  numSessions: 8,
  capacity: 12,
  price: 1200000,
  status: "IN_PROGRESS",
  availableSeats: 3,
  enrollmentOpen: false,
}));
const substitute = {
  ...courses[0],
  classId: 16,
  name: "Substitute class",
  coachId: "other-coach",
};
const session = (classId: number) => ({
  sessionId: `session-${classId}`,
  classId,
  className:
    classId === 16
      ? substitute.name
      : courses.find((course) => course.classId === classId)!.name,
  sessionNo: 2,
  roomId: 2,
  roomName: "Court 02",
  coachId,
  status: "SCHEDULED",
  startAtUtc: "2026-11-10T02:00:00Z",
  endAtUtc: "2026-11-10T03:00:00Z",
  isMakeup: false,
});

async function fixture(page: Page, failImages = false) {
  const state = {
    changed: false,
    imageReads: [] as number[][],
    forbiddenCalls: [] as string[],
  };
  await page.clock.setFixedTime(new Date("2026-11-06T10:00:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "coach-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: coachId,
        fullName: "Coach Alex",
        email: "coach@example.com",
        role: "COACH",
        sportIds: [1, 2, 3],
      });
    if (path === "/api/sports") return json([]);
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/coaches/me/classes")
      return json([...courses, substitute]);
    const sessions = path.match(/^\/api\/classes\/(\d+)\/sessions$/);
    if (sessions)
      return json([
        {
          ...session(Number(sessions[1])),
          sessionId: `past-${sessions[1]}`,
          sessionNo: 1,
          coachId:
            Number(sessions[1]) === 11
              ? "substitute-who-taught-the-lesson"
              : coachId,
          status: "COMPLETED",
          startAtUtc: "2026-11-01T02:00:00Z",
          endAtUtc: "2026-11-01T03:00:00Z",
        },
        session(Number(sessions[1])),
      ]);
    if (path === "/api/coaches/me/class-images") {
      const ids = (url.searchParams.get("ids") ?? "").split(",").map(Number);
      state.imageReads.push(ids);
      if (failImages)
        return route.fulfill({
          status: 503,
          json: {
            error: "unavailable",
            message: "Photos are temporarily unavailable.",
          },
        });
      return json({
        items: ids.map((id) => ({
          kind: "class",
          id,
          version: state.changed ? "2" : "1",
          coverImageId: state.changed ? "updated" : "cover",
          images: [
            {
              imageId: "cover",
              url: "/sporthub/activity-fitness.jpg",
              altText: `Class ${id} cover`,
              sortOrder: 0,
              width: 1200,
              height: 800,
            },
            {
              imageId: "updated",
              url: "/sporthub/hero-main.jpg",
              altText: `Updated class ${id} cover`,
              sortOrder: 1,
              width: 1200,
              height: 800,
            },
          ],
        })),
      });
    }
    if (path.startsWith("/api/manager/service-images"))
      state.forbiddenCalls.push(path);
    if (path.endsWith("/records"))
      return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path.endsWith("/roster"))
      return json({
        session: session(16),
        entries: [],
        attendanceOpensAtUtc: "2026-11-10T01:55:00Z",
        attendanceClosesAtUtc: "2026-11-11T03:00:00Z",
      });
    return json([]);
  });
  return state;
}

for (const width of [1440, 768, 320]) {
  test(`Coach class photos, progress and gallery fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await fixture(page);
    await page.goto("/coach/classes");
    const directory = page.getByRole("region", {
      name: "Your assigned classes",
      exact: true,
    });
    await expect(directory.getByRole("link")).toHaveCount(5);
    await expect(
      directory.getByRole("img", { name: "Class 11 cover", exact: true }),
    ).toBeVisible();
    expect(state.imageReads.every((ids) => !ids.includes(16))).toBe(true);
    if (width === 1440) {
      const result = await new AxeBuilder({ page })
        .include('[aria-label="Your assigned classes"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    await expect(
      directory.getByRole("progressbar", {
        name: `${courses[0].name} lessons completed`,
      }),
    ).toHaveAttribute("value", "1");
    await page
      .getByRole("searchbox", { name: "Search classes" })
      .fill("Tennis");
    await expect(directory.getByRole("link")).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search classes" }).fill("");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await directory
      .getByRole("link")
      .filter({ hasText: courses[0].name })
      .click();
    const info = page.getByRole("region", {
      name: "Class information",
      exact: true,
    });
    await expect(
      info
        .getByRole("button", { name: "Enlarge Class 11 cover", exact: true })
        .getByRole("img"),
    ).toBeVisible();
    await info
      .getByRole("button", {
        name: "Show photo 2: Updated class 11 cover",
        exact: true,
      })
      .click();
    await info
      .getByRole("button", {
        name: "Enlarge Updated class 11 cover",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Updated class 11 cover",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (width === 1440) {
      const result = await new AxeBuilder({ page })
        .include('[aria-label="Class information"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Upload photos", exact: true }),
    ).toHaveCount(0);
    expect(state.forbiddenCalls).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
}

test("Manager's published cover is refreshed when Coach returns to the page", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/coach/classes");
  await expect(
    page.getByRole("img", { name: "Class 11 cover", exact: true }),
  ).toBeVisible();
  state.changed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("img", { name: "Updated class 11 cover", exact: true }),
  ).toBeVisible();
});

test("photo failures retain class navigation and substitute sessions remain scoped", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/coach/classes");
  await expect(
    page.getByText("Class photos are temporarily unavailable.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link").filter({ hasText: courses[0].name }),
  ).toBeVisible();
  await page.goto("/coach/classes/16");
  await expect(
    page.getByRole("heading", { name: "Substitute sessions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Students", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open session 2", exact: true })
    .click();
  await expect(
    page.getByText("Substitute · Access is limited to this session.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-service-photo]")).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: "Attendance", exact: true }),
  ).toBeVisible();
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== "passed") return;
  await expect(page.locator("[data-startup-phase]")).toHaveAttribute(
    "data-startup-phase",
    "ready",
    { timeout: 15000 },
  );
  await page.screenshot({
    path: info.outputPath("coach-ui.png"),
    fullPage: true,
  });
});

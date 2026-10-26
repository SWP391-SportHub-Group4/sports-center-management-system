import { expect, test, type Page } from "@playwright/test";

const date = "2030-10-04";
const coach = "11111111-1111-4111-8111-111111111111";
const label = "Session duration (minutes)";

async function setup(
  page: Page,
  options: { editing?: boolean; legacyDraft?: boolean; closing?: number } = {},
) {
  await page.clock.install({ time: new Date("2030-10-03T03:00:00Z") });
  await page.addInitScript(
    ({ legacyDraft }) => {
      localStorage.setItem("sporthub.accessToken", "duration-fixture");
      localStorage.setItem("sporthub_lang", "en");
      if (
        legacyDraft &&
        !sessionStorage.getItem("sporthub.class-draft.manager.new.0")
      )
        sessionStorage.setItem(
          "sporthub.class-draft.manager.new.0",
          JSON.stringify({
            code: "LEGACY",
            name: "Recovered class",
            sportId: "3",
            coachId: "",
            defaultRoomId: "",
            startDate: "2030-10-04",
            numSessions: 2,
            capacity: 12,
            price: 300000,
            costAmount: 0,
            scheduleRules: [{ dayOfWeek: 5, startTimeLocal: "18:00" }],
          }),
        );
    },
    { legacyDraft: options.legacyDraft },
  );
  const slots: { start: string; end: string }[] = [];
  const writes: Record<string, unknown>[] = [];
  const course = {
    classId: 42,
    version: 1,
    code: "DURATION",
    name: "Class duration",
    sportId: 3,
    sportName: "Badminton",
    defaultRoomId: 7,
    roomName: "Court A",
    coachId: coach,
    coachName: "Alex",
    startDate: date,
    numSessions: 2,
    sessionMinutes: 135,
    capacity: 12,
    price: 300000,
    costAmount: 0,
    status: "DRAFT",
    thresholdStatus: "NOT_EVALUATED",
    scheduleRules: [{ dayOfWeek: 5, startTimeLocal: "17:00" }],
    availableSeats: 12,
    activeHoldCount: 0,
    confirmedCount: 0,
    reservedCount: 0,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    if (path === "/api/users/me")
      return json({
        userId: "manager",
        fullName: "Manager",
        role: "CENTER_MANAGER",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/system-settings")
      return json([
        { key: "center.opening_minutes", value: "480" },
        {
          key: "center.closing_minutes",
          value: String(options.closing ?? 1200),
        },
      ]);
    if (path === "/api/sports" || path === "/api/manager/sports")
      return json([
        {
          sportId: 3,
          name: "Badminton",
          code: "badminton",
          isActive: true,
          services: [
            {
              serviceType: "GROUP_COURSE",
              isEnabled: true,
              defaultSessionMinutes: 90,
              defaultMaxCapacity: 12,
            },
          ],
        },
      ]);
    if (path === "/api/coaches")
      return json([{ userId: coach, fullName: "Alex" }]);
    if (path === "/api/rooms")
      return json([
        {
          roomId: 7,
          name: "Court A",
          roomTypeId: 3,
          sportId: 3,
          capacity: 12,
          isActive: true,
        },
      ]);
    if (path === "/api/room-types")
      return json([{ roomTypeId: 3, sportIds: [3], isActive: true }]);
    if (path === "/api/manager/class-schedule/availability") {
      slots.push({
        start: url.searchParams.get("startUtc")!,
        end: url.searchParams.get("endUtc")!,
      });
      return json({
        available: true,
        roomName: "Court A",
        coachName: "Alex",
        reasons: [],
      });
    }
    if (
      path.startsWith("/api/manager/classes") &&
      ["POST", "PUT"].includes(request.method())
    ) {
      const body = request.postDataJSON();
      writes.push(body);
      return json({ ...course, ...body });
    }
    if (path === "/api/manager/classes/42") return json(course);
    return json([]);
  });
  await page.goto(
    options.editing ? "/manager/classes/42/edit" : "/manager/classes/new",
  );
  return { slots, writes };
}

async function information(page: Page, minutes = "120") {
  await page.getByLabel("Code", { exact: true }).fill("CUSTOM-DURATION");
  await page.getByLabel("Name", { exact: true }).fill("Evening class");
  await page.getByLabel("Sport", { exact: true }).selectOption("3");
  await page.getByLabel(label, { exact: true }).fill(minutes);
}

async function schedule(page: Page, start = "18:00") {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Coach", { exact: true }).selectOption(coach);
  await page.getByLabel("Room", { exact: true }).selectOption("7");
  await page.getByLabel("Course start date", { exact: true }).fill(date);
  await page.getByLabel("Number of sessions", { exact: true }).fill("2");
  await page.getByLabel("Day", { exact: true }).selectOption("5");
  await page.getByLabel("Start", { exact: true }).fill(start);
}

for (const value of ["", "0", "-1", "721", "90.5"]) {
  test(`class information blocks invalid duration ${JSON.stringify(value)}`, async ({
    page,
  }) => {
    const { writes, slots } = await setup(page);
    await information(page, value);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    expect(writes).toHaveLength(0);
    expect(slots).toHaveLength(0);
  });
}

test("custom duration drives availability, review, and save with an exact closing boundary", async ({
  page,
}) => {
  const { slots, writes } = await setup(page);
  await information(page);
  await page.screenshot({
    path: "../.impeccable/review/duration-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.impeccable/review/duration-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await schedule(page);
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeEnabled();
  expect(slots.length).toBeGreaterThan(0);
  expect(
    slots.every((s) => Date.parse(s.end) - Date.parse(s.start) === 120 * 60000),
  ).toBe(true);
  await next.click();
  await next.click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ sessionMinutes: 120, numSessions: 2 });
});

test("changing duration invalidates a previously valid schedule and prevents stale availability", async ({
  page,
}) => {
  const { slots, writes } = await setup(page);
  await information(page, "60");
  await schedule(page, "19:00");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByLabel(label, { exact: true }).fill("61");
  const count = slots.length;
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveAttribute(
    "max",
    "18:59",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Outside center opening hours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  expect(slots).toHaveLength(count);
  expect(writes).toHaveLength(0);
});

for (const start of ["07:59", "18:01", "23:00"]) {
  test(`blocks full session outside center hours starting ${start}`, async ({
    page,
  }) => {
    const { writes } = await setup(page);
    await information(page);
    await schedule(page, start);
    await expect(
      page.getByRole("dialog", { name: "Outside center opening hours" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Choose another time" }).click();
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeDisabled();
    expect(writes).toHaveLength(0);
  });
}

test("duration restores after reload and legacy drafts retain their information", async ({
  page,
}) => {
  await setup(page, { legacyDraft: true });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Recovered class",
  );
  await expect(page.getByLabel(label, { exact: true })).toHaveValue("90");
  await page.getByLabel(label, { exact: true }).fill("125");
  await page.reload();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue("125");
});

test("editing uses saved class duration rather than sport default", async ({
  page,
}) => {
  await setup(page, { editing: true });
  await expect(page.getByLabel(label, { exact: true })).toHaveValue("135");
});

test("publish review checks availability with the saved class duration", async ({
  page,
}) => {
  const { slots } = await setup(page);
  await page.goto("/manager/classes/42");
  await page
    .getByRole("button", { name: "Publish course", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  expect(slots.length).toBeGreaterThan(0);
  expect(
    slots.every((s) => Date.parse(s.end) - Date.parse(s.start) === 135 * 60000),
  ).toBe(true);
});

test("duration cannot exceed the center's total operating window", async ({
  page,
}) => {
  await setup(page, { closing: 600 });
  await information(page, "121");
  await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
    "max",
    "120",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toBeVisible();
});

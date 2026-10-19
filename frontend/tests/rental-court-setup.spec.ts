import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function setup(page: Page) {
  const rooms: Record<string, unknown>[] = [];
  const rates: Record<string, unknown>[] = [];
  const writes: Record<string, unknown>[] = [];
  let reject = false;
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture-token"),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/rooms/rental") {
      const body = request.postDataJSON();
      writes.push(body);
      if (reject)
        return route.fulfill({
          status: 409,
          json: {
            error: "room_name_taken",
            message: "This court name is already used. Choose another name.",
          },
        });
      const room = {
        roomId: 71,
        name: body.name,
        capacity: body.capacity,
        roomTypeId: body.roomTypeId,
        isActive: true,
        activeClassCount: 0,
      };
      rooms.push(room);
      rates.push(
        ...body.rates.map((r: Record<string, unknown>, i: number) => ({
          ...r,
          rateId: i + 1,
          roomId: 71,
          roomTypeId: body.roomTypeId,
          sportId: body.sportId,
          daysOfWeek: (r.daysOfWeek as string[]).join(","),
          isActive: true,
        })),
      );
      return route.fulfill({ status: 201, json: room });
    }
    if (path === "/api/rooms") return route.fulfill({ json: rooms });
    if (path === "/api/manager/court-rates")
      return route.fulfill({ json: rates });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [
          {
            roomTypeId: 51,
            name: "Badminton court",
            sportIds: [41],
            isActive: true,
          },
        ],
      });
    if (path === "/api/sports" || path === "/api/manager/sports")
      return route.fulfill({
        json: [
          {
            sportId: 41,
            code: "badminton",
            name: "Badminton",
            description: null,
            imageUrl: null,
            sortOrder: 1,
            isActive: true,
            services: [{ serviceType: "COURT_RENTAL", isEnabled: true }],
          },
        ],
      });
    if (path.includes("notifications")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "fixture_missing" } });
  });
  return {
    writes,
    fail: () => {
      reject = true;
    },
    recover: () => {
      reject = false;
    },
  };
}

async function openForm(page: Page) {
  await page.goto("/manager/facilities");
  await page
    .getByRole("button", { name: "Create rental court", exact: true })
    .click();
  const form = page.getByRole("region", {
    name: "Create a rental court",
    exact: true,
  });
  await form.getByLabel("Name", { exact: true }).fill("Court 001");
  await form.getByLabel("Sport", { exact: true }).selectOption("41");
  await form.getByLabel("Room type", { exact: true }).selectOption("51");
  return form;
}

test("one save creates a bookable court and its prices appear in Court Rental Pricing", async ({
  page,
}) => {
  const fixture = await setup(page);
  const form = await openForm(page);
  await form
    .getByRole("button", { name: "Create court & open for booking" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Court 001 is open for booking" }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    name: "Court 001",
    sportId: 41,
    roomTypeId: 51,
  });
  expect(fixture.writes[0].hours).toHaveLength(7);
  expect(fixture.writes[0].rates).toHaveLength(1);
  expect(
    (fixture.writes[0].rates as { daysOfWeek: string[] }[])[0].daysOfWeek,
  ).toHaveLength(7);
  await page.getByRole("link", { name: "View rental prices" }).click();
  await expect(
    page.getByRole("cell", { name: "Court 001", exact: true }).first(),
  ).toBeVisible();
  const courtRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Court 001", exact: true }),
  });
  await expect(courtRow).toHaveCount(1);
  await expect(
    courtRow.getByRole("cell", { name: "All week", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Court 001", exact: true }) })
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByLabel("Applies to")).toHaveValue(
    "71",
  );
});

test("weekday pricing lists the selected opening days and keeps different price windows separate", async ({
  page,
}) => {
  const fixture = await setup(page);
  const form = await openForm(page);
  await form.getByLabel("Saturday", { exact: true }).uncheck();
  await form.getByLabel("Sunday", { exact: true }).uncheck();
  await form.getByLabel("Use different prices by time of day").check();
  await form
    .getByRole("button", { name: "Create court & open for booking" })
    .click();
  await page.getByRole("link", { name: "View rental prices" }).click();
  const rows = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Court 001", exact: true }),
    });
  await expect(rows).toHaveCount(2);
  await expect(
    rows.getByRole("cell", {
      name: "Monday, Tuesday, Wednesday, Thursday, Friday",
      exact: true,
    }),
  ).toHaveCount(2);
  await expect(
    rows.getByRole("cell", { name: "All week", exact: true }),
  ).toHaveCount(0);
  expect(fixture.writes[0].rates).toHaveLength(2);
});

test("price gaps are rejected before saving and API errors preserve the entered form", async ({
  page,
}) => {
  const fixture = await setup(page);
  const form = await openForm(page);
  await form.getByLabel("Use different prices by time of day").check();
  const pricing = form.getByRole("region", {
    name: "Rental pricing",
    exact: true,
  });
  await pricing.getByLabel("To", { exact: true }).first().fill("16:00");
  await form
    .getByRole("button", { name: "Create court & open for booking" })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Cover every opening hour",
  );
  expect(fixture.writes).toHaveLength(0);
  await pricing.getByLabel("To", { exact: true }).first().fill("17:00");
  fixture.fail();
  await form
    .getByRole("button", { name: "Create court & open for booking" })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(
    "Court 001",
  );
  fixture.recover();
  await form
    .getByRole("button", { name: "Create court & open for booking" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Court 001 is open for booking" }),
  ).toBeVisible();
});

for (const width of [1440, 390])
  test(`rental setup is accessible and fits at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    await openForm(page);
    await expect(
      page.getByRole("heading", { name: "Booking preview" }),
    ).toBeVisible();
    if (width === 1440)
      expect(
        (await page.getByLabel("Name", { exact: true }).boundingBox())!.width,
      ).toBeGreaterThan(200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const scan = await new AxeBuilder({ page })
      .include('section[aria-labelledby="rental-court-title"]')
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`rental-setup-${width}.png`),
      fullPage: true,
    });
  });

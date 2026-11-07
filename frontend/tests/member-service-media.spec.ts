import { expect, test, type Page } from "@playwright/test";

const starts = new Date(Date.now() + 30 * 86400000).toISOString();
const courses = [1, 2].map((classId) => ({
  classId,
  code: `CLASS-${classId}`,
  name: `Badminton course ${classId}`,
  sportId: 3,
  sportName: "Badminton",
  coachId: null,
  coachName: null,
  defaultRoomId: 7,
  roomName: "Court A",
  startDate: starts.slice(0, 10),
  numSessions: 12,
  capacity: 12,
  availableSeats: 6,
  price: 1200000,
  status: "PUBLISHED",
  enrollmentOpen: true,
  firstSessionStartUtc: starts,
  scheduleRules: [
    { dayOfWeek: 2, startTimeLocal: "18:00", endTimeLocal: "19:30" },
  ],
}));
const gallery = {
  kind: "class",
  id: 1,
  version: "v1",
  coverImageId: "first",
  images: [
    {
      imageId: "first",
      url: "/sporthub/activity-fitness.jpg",
      altText: "First class photo",
      sortOrder: 0,
      width: 1200,
      height: 800,
    },
    {
      imageId: "second",
      url: "/sporthub/hero-main.jpg",
      altText: "Second class photo",
      sortOrder: 1,
      width: 1200,
      height: 800,
    },
  ],
};

async function setup(page: Page, detailForbidden = false, brokenCover = false) {
  const photoReads: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "member-1",
        fullName: "Member",
        email: "member@example.com",
        role: "MEMBER",
        sportIds: [],
      });
    if (path === "/api/sports")
      return json([
        {
          sportId: 3,
          code: "BADMINTON",
          name: "Badminton",
          imageUrl: "/sporthub/hero-main.jpg",
          isActive: true,
          services: [],
        },
      ]);
    if (path === "/api/classes")
      return json({ items: courses, page: 1, pageSize: 100, totalCount: 2 });
    if (path === "/api/classes/1") return json(courses[0]);
    if (path === "/api/classes/1/sessions") return json([]);
    if (path === "/api/members/me/enrollments")
      return json({ items: [], totalCount: 0 });
    if (path === "/api/service-images") {
      photoReads.push(url);
      return json({
        items:
          url.searchParams.get("kind") === "class"
            ? [
                {
                  ...gallery,
                  images: brokenCover
                    ? [
                        {
                          ...gallery.images[0],
                          url: "/missing-service-photo.jpg",
                        },
                      ]
                    : gallery.images,
                },
                {
                  kind: "class",
                  id: 2,
                  version: "v0",
                  coverImageId: null,
                  images: [],
                },
              ]
            : [],
      });
    }
    if (path === "/api/service-images/class/1") {
      photoReads.push(url);
      return detailForbidden
        ? route.fulfill({
            status: 403,
            json: { error: "forbidden", message: "Photo access unavailable" },
          })
        : json(gallery);
    }
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/wallet/me")
      return json({ availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 });
    return json([]);
  });
  return photoReads;
}

test("catalog batches service images and photo gallery supports thumbnails, touch targets and Escape", async ({
  page,
}) => {
  const reads = await setup(page);
  await page.goto("/member/services?view=explore&type=class");
  await expect(
    page.getByRole("heading", { name: "Badminton course 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "First class photo" }),
  ).toBeVisible();
  const batchIds = reads
    .filter((url) => url.pathname === "/api/service-images")
    .map((url) => url.searchParams.get("ids"));
  expect(batchIds.length).toBeGreaterThanOrEqual(1);
  expect([...new Set(batchIds)]).toEqual(["1,2"]);
  expect(
    reads.filter((url) => url.pathname !== "/api/service-images"),
  ).toHaveLength(0);
  await page
    .getByRole("link", { name: "View class: Badminton course 1" })
    .click();
  await page
    .getByRole("button", {
      name: "Show photo 2: Second class photo",
      exact: true,
    })
    .click();
  const enlarge = page.getByRole("button", {
    name: "Enlarge Second class photo",
    exact: true,
  });
  await enlarge.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: "Second class photo", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enlarge).toBeFocused();
  const thumbnail = page.getByRole("button", {
    name: "Show photo 1: First class photo",
    exact: true,
  });
  const bounds = await thumbnail.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
});

test("broken service covers use a labeled sport fallback while legacy services stay readable", async ({
  page,
}) => {
  await setup(page, false, true);
  await page.route("**/_next/image**", (route) =>
    new URL(route.request().url()).searchParams.get("url") ===
    "/missing-service-photo.jpg"
      ? route.fulfill({ status: 404, body: "Missing" })
      : route.continue(),
  );
  await page.goto("/member/services?view=explore&type=class");
  const firstCard = page.locator("li").filter({
    has: page.getByRole("heading", {
      name: "Badminton course 1",
      exact: true,
    }),
  });
  await expect(
    firstCard.locator('[data-service-photo="category"]'),
  ).toBeVisible();
  await expect(
    firstCard.getByText("Category image · illustrative"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Badminton course 2", exact: true }),
  ).toBeVisible();
});

test("photo read failure does not revoke class access or hide registration", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto("/member/services?view=explore&type=class&course=1");
  await expect(
    page.getByRole("heading", { name: "Badminton course 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Photos are temporarily unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Class access has ended" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("1,200,000", { exact: false }).first(),
  ).toBeVisible();
});

for (const width of [1440, 1151, 768, 320]) {
  test(`five Gym plans keep their own photos and purchase controls at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    const plans = [6, 30, 90, 180, 365].map((durationDays, index) => ({
      packageId: index + 10,
      name: `Gym plan ${index + 1}`,
      durationDays,
      price: [150000, 600000, 1800000, 2400000, 6000000][index],
      originalPrice: index === 3 ? 3600000 : null,
      description: "Gym access during opening hours",
      isActive: true,
    }));
    await page.route("**/api/membership-packages", (route) =>
      route.fulfill({
        json: [
          ...plans,
          {
            packageId: 50000,
            name: "Gym day pass",
            durationDays: 1,
            price: 50000,
            isActive: true,
          },
        ],
      }),
    );
    await page.route("**/api/service-images?*", (route) => {
      if (
        new URL(route.request().url()).searchParams.get("kind") !== "membership"
      )
        return route.fallback();
      return route.fulfill({
        json: {
          items: plans.map((plan) => ({
            kind: "membership",
            id: plan.packageId,
            version: "1",
            coverImageId: `photo-${plan.packageId}`,
            images: [
              {
                imageId: `photo-${plan.packageId}`,
                url: "/sporthub/activity-fitness.jpg",
                altText: `${plan.name} photo`,
                sortOrder: 0,
                width: 1200,
                height: 800,
              },
            ],
          })),
        },
      });
    });
    await page.goto("/member/services?view=explore&type=gym");
    const region = page.getByRole("region", { name: "Gym plans", exact: true });
    await expect(region.getByRole("article")).toHaveCount(6);
    await expect(page.locator("[data-startup-phase]")).toHaveAttribute(
      "data-startup-phase",
      "ready",
      { timeout: 20000 },
    );
    const bottoms: number[] = [];
    for (const plan of plans) {
      const card = region.getByRole("article").filter({
        has: page.getByRole("heading", { name: plan.name, exact: true }),
      });
      const photo = card.getByRole("img", {
        name: `${plan.name} photo`,
        exact: true,
      });
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(
          () =>
            photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
          { timeout: 15000 },
        )
        .toBeGreaterThan(0);
      const button = card.getByRole("button", {
        name: "Choose plan",
        exact: true,
      });
      await expect(button).toBeEnabled();
      const cardBox = (await card.boundingBox())!;
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
        cardBox.x + cardBox.width + 1,
      );
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(
        cardBox.y + cardBox.height,
      );
      bottoms.push(
        cardBox.y +
          cardBox.height +
          (await page.evaluate(() => window.scrollY)),
      );
    }
    const dayPass = region.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Gym day pass", exact: true }),
    });
    expect(
      (await dayPass.boundingBox())!.y +
        (await page.evaluate(() => window.scrollY)),
    ).toBeGreaterThanOrEqual(Math.max(...bottoms));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await region
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: plans[4].name, exact: true }),
      })
      .getByRole("button", { name: "View plan", exact: true })
      .click();
    const detail = page.getByRole("dialog");
    await expect(
      detail.getByRole("img", { name: `${plans[4].name} photo`, exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
  });
}

test.use({ viewport: { width: 1440, height: 900 } });
test.afterEach(async ({ page }, info) => {
  if (info.status === "passed") {
    await expect(page.locator("[data-startup-phase]")).toHaveAttribute(
      "data-startup-phase",
      "ready",
      { timeout: 15000 },
    );
    await page.screenshot({
      path: info.outputPath("verified-ui.png"),
      fullPage: true,
    });
  }
});

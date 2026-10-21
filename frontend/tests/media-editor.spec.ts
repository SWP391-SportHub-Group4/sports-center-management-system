import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import type { GallerySport } from "../src/components/homepage/sport-gallery";

const coachIds = [1, 2, 3].map(
  (n) => `00000000-0000-4000-8000-00000000000${n}`,
);
const uploadUrl = "/sporthub/court-volt/hero-rally.png";
const imageFile = path.resolve(
  "public/sporthub/court-volt/course-basketball.png",
);

const defaultSports: GallerySport[] = [
  {
    sportId: 3,
    code: "badminton",
    name: "Badminton",
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
  },
  {
    sportId: 4,
    code: "basketball",
    name: "Basketball",
    imageUrl: null,
    sortOrder: 1,
    isActive: true,
  },
  {
    sportId: 1,
    code: "gym",
    name: "Gym",
    imageUrl: null,
    sortOrder: 2,
    isActive: true,
  },
];

async function setup(
  page: Page,
  options: { sports?: GallerySport[]; values?: Record<string, string> } = {},
) {
  let document = {
    revision: "initial",
    values: {
      "hero.lead": "Published introduction",
      "bookmarks.coachIds": coachIds.join(","),
      ...options.values,
    } as Record<string, string>,
    updatedAt: null as string | null,
  };
  const calls: {
    uploads: number;
    saves: Record<string, string>[];
    uploadError: boolean;
    conflict: boolean;
    sports: GallerySport[];
    galleryError: boolean;
  } = {
    uploads: 0,
    saves: [],
    uploadError: false,
    conflict: false,
    sports: structuredClone(options.sports ?? defaultSports),
    galleryError: false,
  };
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture"),
  );
  await page.context().route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/public/sports-gallery")
      return calls.galleryError
        ? route.fulfill({
            status: 503,
            json: { message: "Sports unavailable" },
          })
        : route.fulfill({ json: calls.sports });
    if (
      url.pathname === "/api/manager/sports" ||
      /^\/api\/manager\/sports\/\d+$/.test(url.pathname)
    ) {
      const toManager = (sport: GallerySport) => ({
        ...sport,
        description: null,
        services: [
          {
            serviceType: "GROUP_COURSE",
            isEnabled: true,
            defaultSessionMinutes: 90,
            defaultMaxCapacity: 12,
          },
        ],
        readiness: [],
      });
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        const sport = {
          sportId:
            Math.max(...calls.sports.map((sport) => sport.sportId), 0) + 1,
          code: body.code,
          name: body.name,
          imageUrl: body.imageUrl || null,
          sortOrder: calls.sports.length,
          isActive: true,
        };
        calls.sports.push(sport);
        return route.fulfill({ status: 201, json: toManager(sport) });
      }
      if (request.method() === "PUT") {
        const sport = calls.sports.find(
          (sport) => sport.sportId === Number(url.pathname.split("/").at(-1)),
        )!;
        Object.assign(sport, {
          name: request.postDataJSON().name,
          imageUrl: request.postDataJSON().imageUrl || null,
        });
        return route.fulfill({ json: toManager(sport) });
      }
      return route.fulfill({ json: calls.sports.map(toManager) });
    }
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Media Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (url.pathname === "/api/coaches")
      return route.fulfill({
        json: coachIds.map((userId, index) => ({
          userId,
          fullName: ["Alex Nguyen", "Minh Tran", "Linh Pham"][index],
          avatarUrl: "/sporthub/avatar-default.svg",
          bio: null,
          sportIds: [3],
          sportNames: ["Badminton"],
        })),
      });
    if (url.pathname === "/api/public/overview")
      return route.fulfill({
        json: {
          coachCount: 3,
          memberCount: 120,
          facilityCount: 8,
          facilities: [],
        },
      });
    if (url.pathname === "/api/manager/media/images") {
      calls.uploads++;
      return calls.uploadError
        ? route.fulfill({
            status: 503,
            json: {
              error: "storage_unavailable",
              message: "Upload failed. Try again.",
            },
          })
        : route.fulfill({ json: { url: uploadUrl } });
    }
    if (url.pathname === "/api/landing-page") {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        calls.saves.push(body.values);
        if (calls.conflict)
          return route.fulfill({
            status: 409,
            json: {
              error: "landing_content_changed",
              message:
                "Another Manager updated this page. Reload the latest content before saving.",
            },
          });
        document = {
          ...body,
          revision: "saved",
          updatedAt: "2026-10-21T02:00:00Z",
        };
      }
      return route.fulfill({ json: document });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/media");
  await expect(
    page.getByRole("heading", { name: "A stronger community" }),
  ).toBeVisible();
  return calls;
}

async function chooseImage(page: Page) {
  const button = page.getByRole("button", {
    name: /^Replace image: Photo banner.*Badminton$/,
    exact: true,
  });
  await button.locator("..").locator("..").hover();
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles(imageFile);
  await expect(
    page.getByRole("dialog", { name: "Frame your image" }),
  ).toBeVisible();
}

test("image crop stays in preview until Save changes publishes it", async ({
  page,
}) => {
  const calls = await setup(page);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
  const imageButton = page.getByRole("button", {
    name: /^Replace image: Photo banner.*Badminton$/,
    exact: true,
  });
  await imageButton.focus();
  await expect(imageButton.locator("..")).toHaveCSS("opacity", "1");
  await chooseImage(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(calls.uploads).toBe(0);
  await chooseImage(page);
  await page.getByRole("slider", { name: /Zoom/ }).fill("1.5");
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#media-gallery img").first()).toHaveAttribute(
    "src",
    new RegExp("hero-rally"),
  );
  expect(calls.uploads).toBe(1);
  expect(calls.saves).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes are live", { exact: true }),
  ).toBeVisible();
  expect(calls.saves[0]["gallery.sports.3.image"]).toBe(uploadUrl);
  expect(calls.saves[0]["hero.lead"]).toBe("Published introduction");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
  await page.goto("/");
  await expect(
    page
      .locator(
        '[aria-labelledby="training-gallery-title"] [data-sport-id="3"] img',
      )
      .first(),
  ).toHaveAttribute("src", /hero-rally/);
});

test("Cancel restores all draft edits and navigation warns before leaving", async ({
  page,
}) => {
  const calls = await setup(page);
  await page
    .getByRole("button", { name: "Edit Hero description", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .fill("Draft introduction");
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .press("Enter");
  await expect(page.locator("#media-hero")).toContainText("Draft introduction");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator('a[href="/manager"]').first().click();
  await expect(page).toHaveURL(/\/manager\/media/);
  await chooseImage(page);
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator("#media-hero")).toContainText(
    "Published introduction",
  );
  await expect(page.locator("#media-gallery img").first()).toHaveAttribute(
    "src",
    /course-badminton/,
  );
  expect(calls.saves).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
});

test("dragging a crop follows the pointer, clamps to its frame and keeps controls in sync", async ({
  page,
}) => {
  await setup(page);
  await chooseImage(page);
  await page.getByRole("slider", { name: /Zoom/ }).fill("1.5");
  const canvas = page.locator('canvas[aria-label="Image crop preview"]');
  const horizontal = page.getByRole("slider", { name: /Horizontal position/ });
  const vertical = page.getByRole("slider", { name: /Vertical position/ });
  const before = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 40,
    bounds.y + bounds.height / 2 + 20,
    { steps: 6 },
  );
  expect(Number(await horizontal.inputValue())).toBeLessThan(50);
  expect(Number(await vertical.inputValue())).toBeLessThan(50);
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
    )
    .not.toBe(before);
  await page.mouse.move(
    bounds.x + bounds.width + 400,
    bounds.y + bounds.height + 400,
    { steps: 4 },
  );
  await expect(horizontal).toHaveValue("0");
  await expect(vertical).toHaveValue("0");
  await page.mouse.up();
  await page.mouse.move(bounds.x, bounds.y);
  await expect(horizontal).toHaveValue("0");
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await expect(horizontal).toHaveValue("50");
  await expect(vertical).toHaveValue("50");
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await expect(horizontal).toHaveValue("51");
  await canvas.press("Shift+ArrowUp");
  await expect(vertical).toHaveValue("60");
});

test("inline text supports double-click, keyboard, Escape, empty recovery and publishing", async ({
  page,
}) => {
  const calls = await setup(page);
  await expect(
    page.getByRole("button", { name: "Edit text", exact: true }),
  ).toHaveCount(0);
  const title = page.getByRole("button", {
    name: "Edit Hero title",
    exact: true,
  });
  await title.dblclick();
  const titleInput = page.getByRole("textbox", {
    name: "Edit Hero title",
    exact: true,
  });
  await titleInput.fill("Temporary title");
  await titleInput.press("Escape");
  await expect(page.locator("#media-hero h2")).toContainText("Every session");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
  await title.focus();
  await title.press("F2");
  await titleInput.fill("");
  await titleInput.press("Enter");
  await expect(
    page.getByText("Text cannot be empty. Previous text restored."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Edit Community title", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Edit Community title", exact: true })
    .fill("Built around your next session");
  await page
    .getByRole("textbox", { name: "Edit Community title", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Edit Hero title", exact: true })
    .dblclick();
  const caption = page.getByRole("textbox", {
    name: "Edit Hero title",
    exact: true,
  });
  await caption.fill("Court practice");
  await caption.press("Shift+Enter");
  await caption.pressSequentially("Every week");
  await expect(caption).toHaveValue("Court practice\nEvery week");
  await caption.press("Enter");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes are live", { exact: true }),
  ).toBeVisible();
  expect(calls.saves[0]["bookmarks.intro.title"]).toBe(
    "Built around your next session",
  );
  expect(calls.saves[0]["hero.title"]).toBe("Court practice\nEvery week");
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Built around your next session",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Court practice Every week",
      exact: true,
    }),
  ).toBeVisible();
});

test("failed upload can retry and a save conflict preserves the draft", async ({
  page,
}) => {
  const calls = await setup(page);
  const replace = page.getByRole("button", {
    name: /^Replace image: Photo banner.*Badminton$/,
  });
  await replace.focus();
  const invalidChooser = page.waitForEvent("filechooser");
  await replace.click();
  await (
    await invalidChooser
  ).setFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a JPG" }),
  ).toBeInViewport();
  await page.screenshot({
    path: "../.impeccable/review/desktop-error.png",
    animations: "disabled",
  });
  expect(calls.uploads).toBe(0);
  calls.uploadError = true;
  await chooseImage(page);
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Upload failed" }),
  ).toBeVisible();
  calls.uploadError = false;
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  calls.conflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Another Manager" }),
  ).toBeVisible();
  await expect(page.locator("#media-gallery img").first()).toHaveAttribute(
    "src",
    /hero-rally/,
  );
  await expect(
    page.getByRole("button", { name: "Load latest content" }),
  ).toBeVisible();
  calls.conflict = false;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes are live", { exact: true }),
  ).toBeVisible();
});

test("gallery searches catalog names, scrolls horizontally and keeps captions read-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const sports = [
    ...defaultSports,
    ...["Tennis", "Volleyball", "Pickleball", "Swimming", "Table tennis"].map(
      (name, index) => ({
        sportId: index + 10,
        code: name.toLowerCase().replaceAll(" ", "_"),
        name,
        imageUrl: null,
        sortOrder: index + 3,
        isActive: index !== 1,
      }),
    ),
  ];
  await setup(page, {
    sports,
    values: { "gallery.photos.0.en": "Old editable caption" },
  });
  const gallery = page.locator("#media-gallery");
  const strip = gallery.getByRole("region", { name: "Sports gallery editor" });
  await expect(gallery.locator("figure")).toHaveCount(8);
  await expect(gallery).not.toContainText("Conditioning");
  await expect(gallery).not.toContainText("Old editable caption");
  await gallery.locator('figure[data-sport-id="3"] figcaption').dblclick();
  await expect(gallery.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeHidden();
  expect(
    await strip.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await expect(gallery.getByRole("slider")).toHaveCount(0);
  await expect(gallery).not.toContainText("8 sports");
  await expect(gallery).not.toContainText("Sport names are managed");
  const left = gallery.getByRole("button", { name: "Scroll sports left" });
  const right = gallery.getByRole("button", { name: "Scroll sports right" });
  await expect(left).toBeDisabled();
  await right.click();
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(left).toBeEnabled();
  await left.click();
  await expect
    .poll(() => strip.evaluate((element) => Math.round(element.scrollLeft)))
    .toBe(0);
  const frame = await gallery.locator("figure img").first().boundingBox();
  const previous = await left.boundingBox();
  const next = await right.boundingBox();
  const viewport = await strip.boundingBox();
  expect(frame && previous && next).toBeTruthy();
  expect(previous!.x + previous!.width).toBeLessThan(viewport!.x - 8);
  expect(next!.x).toBeGreaterThan(viewport!.x + viewport!.width + 8);
  expect(
    Math.abs(
      previous!.y + previous!.height / 2 - (frame!.y + frame!.height / 2),
    ),
  ).toBeLessThan(3);
  expect(
    Math.abs(next!.y + next!.height / 2 - previous!.y - previous!.height / 2),
  ).toBeLessThan(1);
  expect(next!.x - previous!.x).toBeGreaterThan(800);
  await strip.focus();
  await strip.press("ArrowRight");
  await expect
    .poll(() => strip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await gallery
    .getByRole("button", { name: "Search sports", exact: true })
    .click();
  const search = gallery.getByRole("searchbox", {
    name: "Search sports by name",
  });
  await expect(search).toBeFocused();
  await search.fill("TENNIS");
  await expect(gallery.locator("figure")).toHaveCount(2);
  await search.fill("not a sport");
  await expect(gallery.getByText(/No sports match/)).toBeVisible();
  await gallery
    .getByRole("button", { name: "Clear search", exact: true })
    .click();
  await expect(gallery.locator("figure")).toHaveCount(8);
  await search.press("Escape");
  await expect(
    gallery.getByRole("button", { name: "Search sports", exact: true }),
  ).toBeFocused();
  await gallery.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../.impeccable/review/gallery-desktop.png",
    animations: "disabled",
  });
  await gallery
    .getByRole("button", { name: "Search sports", exact: true })
    .click();
  await page.screenshot({
    path: "../.impeccable/review/gallery-search-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gallery.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../.impeccable/review/gallery-mobile.png",
    animations: "disabled",
  });
  const publicPage = await page.context().newPage();
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.goto("/");
  const publicGallery = publicPage.locator(
    '[aria-labelledby="training-gallery-title"]',
  );
  await expect(
    publicGallery.locator('figure[data-sport-id="10"]').first(),
  ).toBeAttached();
  await publicGallery.scrollIntoViewIfNeeded();
  await expect(publicGallery.locator("..")).not.toHaveAttribute(
    "data-pending",
    "true",
  );
  await publicPage.screenshot({
    path: "../.impeccable/review/gallery-public-desktop.png",
    animations: "disabled",
  });
  const mobilePublicPage = await page.context().newPage();
  await mobilePublicPage.setViewportSize({ width: 390, height: 844 });
  await mobilePublicPage.goto("/");
  const mobilePublicGallery = mobilePublicPage.locator(
    '[aria-labelledby="training-gallery-title"]',
  );
  await expect(mobilePublicGallery.locator("figure").first()).toBeAttached();
  await mobilePublicGallery.evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
  await expect(mobilePublicGallery.locator("..")).not.toHaveAttribute(
    "data-pending",
    "true",
  );
  await expect(mobilePublicGallery.locator("figure").first()).toBeInViewport();
  await expect(mobilePublicGallery.locator("figcaption").first()).toBeVisible();
  await mobilePublicPage.screenshot({
    path: "../.impeccable/review/gallery-public-mobile.png",
    animations: "disabled",
  });
  await mobilePublicPage.close();
  await publicPage.close();
});

test("creating and renaming a sport syncs open Media and landing tabs without losing the image draft", async ({
  page,
}) => {
  const calls = await setup(page, {
    values: {
      "gallery.photos.0.src": "/sporthub/court-volt/course-basketball.png",
      "gallery.photos.0.en": "Legacy caption",
    },
  });
  await expect(
    page.locator('#media-gallery figure[data-sport-id="3"] img'),
  ).toHaveAttribute("src", /course-basketball/);
  await chooseImage(page);
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Hero description", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .fill("Draft stays while sports refresh");
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .press("Enter");
  const landing = await page.context().newPage();
  await landing.goto("/");
  const publicGallery = landing.locator(
    '[aria-labelledby="training-gallery-title"]',
  );
  await expect(
    publicGallery.locator('figure[data-sport-id="3"]').first(),
  ).toBeAttached();
  const catalog = await page.context().newPage();
  await catalog.goto("/manager/sports");
  await catalog
    .getByRole("button", { name: "Create sport", exact: true })
    .click();
  await catalog
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Tennis");
  await catalog
    .getByRole("dialog")
    .getByLabel("Code", { exact: true })
    .fill("tennis");
  await catalog
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(catalog.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator("#media-gallery figcaption").filter({ hasText: "Tennis" }),
  ).toHaveCount(1);
  await expect(
    publicGallery.locator("figcaption").filter({ hasText: "Tennis" }).first(),
  ).toBeAttached();
  await catalog
    .getByRole("row")
    .filter({ hasText: "Badminton" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await catalog
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Shuttle games");
  await catalog
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(catalog.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('#media-gallery figure[data-sport-id="3"] figcaption'),
  ).toContainText("Shuttle games");
  await expect(
    publicGallery
      .locator("figcaption")
      .filter({ hasText: "Shuttle games" })
      .first(),
  ).toBeAttached();
  await expect(
    page.locator('#media-gallery figure[data-sport-id="3"] img'),
  ).toHaveAttribute("src", /hero-rally/);
  await expect(page.locator("#media-hero")).toContainText(
    "Draft stays while sports refresh",
  );
  expect(calls.saves).toHaveLength(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes are live", { exact: true }),
  ).toBeVisible();
  expect(calls.saves[0]).not.toHaveProperty("gallery.photos.0.en");
  expect(calls.saves[0]["gallery.photos.0.src"]).toBe(
    "/sporthub/court-volt/course-basketball.png",
  );
  expect(calls.saves[0]["gallery.sports.3.image"]).toBe(uploadUrl);
  await catalog.close();
  await landing.close();
});

test("empty and failed sport refreshes do not manufacture entries or discard Media edits", async ({
  page,
}) => {
  const calls = await setup(page, { sports: [] });
  await expect(page.locator("#media-gallery")).toContainText("Create a sport");
  await expect(page.locator("#media-gallery figure")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Hero description", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .fill("Keep this edit");
  await page
    .getByRole("textbox", { name: "Edit Hero description", exact: true })
    .press("Enter");
  calls.galleryError = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("sporthub:sport-catalog-changed")),
  );
  await expect(
    page.getByRole("button", { name: "Retry sports" }),
  ).toBeVisible();
  await expect(page.locator("#media-hero")).toContainText("Keep this edit");
  calls.galleryError = false;
  calls.sports = structuredClone(defaultSports);
  await page.getByRole("button", { name: "Retry sports" }).click();
  await expect(page.locator("#media-gallery figure")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
});

test("desktop and touch layouts keep image actions and save dock accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await chooseImage(page);
  await page.screenshot({
    path: "../.impeccable/review/desktop-crop.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[class*="saveDock"]')
        .evaluate(
          (element) =>
            new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
        ),
    )
    .toBe(0);
  await page.locator("#media-gallery").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../.impeccable/review/desktop.png",
    animations: "disabled",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("desktop-full.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Edit Hero title", exact: true })
    .dblclick();
  await page.screenshot({
    path: "../.impeccable/review/desktop-inline.png",
    animations: "disabled",
  });
  await page
    .getByRole("textbox", { name: "Edit Hero title", exact: true })
    .press("Escape");
  const browser = page.context().browser()!;
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const phone = await mobile.newPage();
  await setup(phone);
  await phone
    .getByRole("button", { name: "Edit Hero title", exact: true })
    .tap();
  await expect(
    phone.getByRole("textbox", { name: "Edit Hero title", exact: true }),
  ).toBeVisible();
  await phone.screenshot({
    path: "../.impeccable/review/mobile-inline.png",
    animations: "disabled",
  });
  await phone
    .getByRole("textbox", { name: "Edit Hero title", exact: true })
    .press("Escape");
  const button = phone.getByRole("button", {
    name: /^Replace image: Photo banner.*Badminton$/,
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  await expect(button.locator("..")).toHaveCSS("opacity", "1");
  const chooser = phone.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles(imageFile);
  await expect(
    phone.getByRole("dialog", { name: "Frame your image" }),
  ).toBeVisible();
  await phone.screenshot({
    path: "../.impeccable/review/mobile-crop.png",
    animations: "disabled",
  });
  await phone.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(phone.getByRole("dialog")).toHaveCount(0);
  await expect(
    phone.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeInViewport();
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await phone.screenshot({
    path: "../.impeccable/review/mobile.png",
    animations: "disabled",
  });
  await phone.evaluate(() => window.scrollTo(0, 0));
  await phone.screenshot({
    path: testInfo.outputPath("mobile-full.png"),
    fullPage: true,
    animations: "disabled",
  });
  await mobile.close();
});

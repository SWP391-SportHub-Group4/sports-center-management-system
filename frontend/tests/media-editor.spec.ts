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
  options: {
    sports?: GallerySport[];
    values?: Record<string, string>;
    extraCoaches?: boolean;
  } = {},
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
        json: [
          ...coachIds,
          ...(options.extraCoaches
            ? ["00000000-0000-4000-8000-000000000004"]
            : []),
        ].map((userId, index) => ({
          userId,
          fullName: ["Alex Nguyen", "Minh Tran", "Linh Pham", "Jordan Le"][
            index
          ],
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
    page.getByRole("heading", {
      name: options.values?.["bookmarks.intro.title"] ?? "A stronger community",
    }),
  ).toBeVisible();
  return calls;
}

async function chooseImage(
  page: Page,
  label: string | RegExp = /^Replace image: Photo banner.*Badminton$/,
) {
  const button = page.getByRole("button", {
    name: label,
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

test("restored landing frames keep published Media images and text on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page, {
    values: {
      "hero.title": "Your next session starts here",
      "bookmarks.intro.title": "Our active community",
      "gallery.sports.3.image": uploadUrl,
      "booking.image": uploadUrl,
      "booking.title": "Book your next game",
    },
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your next session starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Our active community", exact: true }),
  ).toBeVisible();
  const coachFrame = page
    .locator("#coaches-details article img")
    .first()
    .locator("..");
  const gallery = page.locator('[aria-labelledby="training-gallery-title"]');
  const arena = page.locator('[aria-labelledby="arena-tour-title"]');
  const booking = page.locator("#book-court");
  await expect(
    gallery.locator('figure[data-sport-id="3"] img').first(),
  ).toHaveAttribute("src", /hero-rally/);
  await expect(
    booking.getByRole("heading", { name: "Book your next game", exact: true }),
  ).toBeVisible();
  await expect(booking.locator("img")).toHaveAttribute("src", /hero-rally/);
  await expect(coachFrame).toHaveCSS("aspect-ratio", "1.5 / 1");
  await expect(gallery.locator("figure img").first().locator("..")).toHaveCSS(
    "aspect-ratio",
    "1.48 / 1",
  );
  await expect(booking.locator("img").locator("..")).toHaveCSS(
    "min-height",
    "540px",
  );
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `../.impeccable/review/landing-restored-${label}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.locator('[aria-labelledby="homepage-stats-title"]').screenshot({
      path: `../.impeccable/review/landing-community-${label}.png`,
      animations: "disabled",
    });
    await gallery.screenshot({
      path: `../.impeccable/review/landing-gallery-${label}.png`,
      animations: "disabled",
    });
    await arena.screenshot({
      path: `../.impeccable/review/landing-arena-${label}.png`,
      animations: "disabled",
    });
    await booking.screenshot({
      path: `../.impeccable/review/landing-booking-${label}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(coachFrame).toHaveCSS("aspect-ratio", "1.5 / 1");
  await expect(gallery.locator("figure img").first().locator("..")).toHaveCSS(
    "aspect-ratio",
    "1.38 / 1",
  );
  await expect(booking.locator("img").locator("..")).toHaveCSS(
    "aspect-ratio",
    "4 / 3",
  );
});

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
  await expect(page.locator("[class*=savedFeedback]")).toBeVisible();
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
  await chooseImage(page);
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
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

test("copy edits can be undone, Preview uses the unsaved draft and Restore resets main defaults after publishing", async ({
  page,
}) => {
  const calls = await setup(page);
  await expect(
    page.getByRole("heading", { name: "Media", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Homepage sections" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open homepage" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /^Edit (Hero|Community)/ }),
  ).toHaveCount(0);
  await page.locator("#media-hero h2").dblclick();
  await expect(
    page.getByRole("textbox", { name: "Hero title", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Hero title", exact: true })
    .press("Escape");
  await expect(page.locator('textarea,[contenteditable="true"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Preview", exact: true }),
  ).toBeHidden();
  await chooseImage(page);
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const popup = page.getByRole("dialog", {
    name: "Homepage preview",
    exact: true,
  });
  await expect(popup).toBeVisible();
  const frame = page.frameLocator('iframe[title="Draft homepage"]');
  await expect(
    frame.locator('figure[data-sport-id="3"] img').first(),
  ).toHaveAttribute("src", /hero-rally/);
  expect(calls.saves).toHaveLength(0);
  await frame
    .getByRole("link", { name: "Book a court", exact: true })
    .press("Enter");
  expect(
    page.frames().some((frame) => frame.url().includes("media-preview=true")),
  ).toBe(true);
  await frame.locator("#performance-title").press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preview", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(calls.saves[0]["gallery.sports.3.image"]).toBe(uploadUrl);
  await page.reload();
  await page
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore to draft", exact: true })
    .click();
  await expect(
    page.locator('#media-gallery [data-sport-id="3"] img').first(),
  ).toHaveAttribute("src", /course-badminton/);
  expect(calls.saves).toHaveLength(1);
  await expect(page.locator("#media-hero")).toContainText(
    "Explore dedicated spaces for court sports and athletic training.",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(calls.saves[1]["gallery.sports.3.image"]).toBeUndefined();
  expect(calls.saves[1]["hero.lead"]).toBeUndefined();
});

for (const width of [1440, 390]) {
  test(`Restore original resets all main copy and images and publishes the same landing page at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const calls = await setup(page, {
      values: {
        "hero.title": "Custom hero",
        "hero.lead": "Custom introduction",
        "bookmarks.intro.title": "Custom community",
        "gallery.title": "Custom gallery",
        "gallery.sports.3.image": uploadUrl,
        "bookmarks.1.items.0.image": uploadUrl,
        "arena.zones.conditioning.label": "Conditioning",
        "arena.zones.conditioning.title": "Custom zone",
        "arena.zones.badminton.image": uploadUrl,
        "booking.title": "Custom booking",
        "booking.image": "/sporthub/court-volt/course-basketball.png",
        "faq.questions.0.answer": "Custom answer",
        "brand.logo.image": uploadUrl,
      },
    });
    await page
      .getByRole("button", { name: "Restore original", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "all images, titles and content",
    );
    await page
      .getByRole("button", { name: "Restore to draft", exact: true })
      .click();
    await expect(page.locator('[data-media-field="hero.title"]')).toHaveText(
      "Every session\nhas a purpose.",
    );
    await expect(
      page.locator('[data-media-field="bookmarks.intro.title"]'),
    ).toHaveText("A stronger community");
    await expect(page.locator('[data-media-field="gallery.title"]')).toHaveText(
      "Energy across every court",
    );
    await expect(
      page.locator('#media-gallery [data-sport-id="3"] img').first(),
    ).toHaveAttribute("src", /course-badminton/);
    await page
      .getByRole("button", { name: "Show Gym zone", exact: true })
      .click();
    await expect(
      page.locator('[data-media-field="arena.zones.conditioning.title"]'),
    ).toHaveText("Gym");
    expect(calls.saves).toHaveLength(0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `../.impeccable/review/media-main-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.locator("[class*=savedFeedback]")).toBeVisible();
    expect(Object.keys(calls.saves[0])).toEqual(["bookmarks.coachIds"]);
    await page.reload();
    await expect(page.locator('[data-media-field="hero.title"]')).toHaveText(
      "Every session\nhas a purpose.",
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Every session has a purpose.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .locator(
          '[aria-labelledby="training-gallery-title"] [data-sport-id="3"] img',
        )
        .first(),
    ).toHaveAttribute("src", /course-badminton/);
    const arena = page.locator('[aria-labelledby="arena-tour-title"]');
    await arena.getByRole("tab", { name: "Gym", exact: true }).click();
    await expect(
      arena
        .getByRole("tabpanel", { name: "Gym", exact: true })
        .getByText("Gym", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#book-court img")).toHaveAttribute(
      "src",
      /hero-rally/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `../.impeccable/review/landing-main-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

  test(`Media edits titles and content as plain text and publishes the draft at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await setup(page);
    const title = page.locator('[data-media-field="hero.title"]');
    await title.dblclick();
    const editor = page.getByRole("textbox", {
      name: "Hero title",
      exact: true,
    });
    await editor.fill("Train together. Play stronger.");
    const inputBounds = await editor.boundingBox();
    const titleBounds = await title.boundingBox();
    expect(inputBounds!.width).toBeGreaterThan(180);
    expect(inputBounds!.width).toBeLessThanOrEqual(titleBounds!.width + 1);
    await page.screenshot({
      path: info.outputPath(`media-editing-${width}.png`),
      animations: "disabled",
    });
    await editor.press("Enter");
    await expect(title).toHaveText("Train together. Play stronger.");
    const lead = page.locator('[data-media-field="hero.lead"]');
    await lead.focus();
    await lead.press("Enter");
    const body = page.getByRole("textbox", {
      name: "Hero description",
      exact: true,
    });
    await body.fill("A training home for every athlete.");
    await body.press("End");
    await body.press("Shift+Enter");
    await body.pressSequentially("Find your next session.");
    await body.press("Enter");
    await expect(lead).toHaveText(
      "A training home for every athlete.\nFind your next session.",
    );
    await title.dblclick();
    await editor.fill("Discard this edit");
    await editor.press("Escape");
    await expect(title).toHaveText("Train together. Play stronger.");
    await lead.dblclick();
    await body.fill("");
    await body.press("Tab");
    await expect(lead).toHaveText(
      "A training home for every athlete.\nFind your next session.",
    );
    const faq = page.locator('[data-media-field="faq.questions.0.question"]');
    await faq.dblclick();
    await page
      .getByRole("textbox", { name: "FAQ question 1", exact: true })
      .fill("<strong>Can I join?</strong>");
    await page
      .getByRole("textbox", { name: "FAQ question 1", exact: true })
      .press("Enter");
    await expect(faq).toHaveText("<strong>Can I join?</strong>");
    await expect(faq.locator("strong")).toHaveCount(0);
    await page.locator("#media-hero").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`media-text-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator('iframe[title="Draft homepage"]');
    await expect(frame.locator("#performance-title")).toHaveText(
      "Train together. Play stronger.",
    );
    await expect(
      frame.getByText(
        "A training home for every athlete.\nFind your next session.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(calls.saves).toHaveLength(0);
    await page
      .getByRole("dialog", { name: "Homepage preview" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Changes are live", { exact: true }),
    ).toBeVisible();
    expect(calls.saves.at(-1)).toMatchObject({
      "hero.title": "Train together. Play stronger.",
      "hero.lead":
        "A training home for every athlete.\nFind your next session.",
      "faq.questions.0.question": "<strong>Can I join?</strong>",
    });
    await page.reload();
    await expect(title).toHaveText("Train together. Play stronger.");
  });
}

test("logo icon preserves original upload and keeps the SportHub wordmark before and after publishing", async ({
  page,
}) => {
  const calls = await setup(page);
  const editor = page.getByLabel("Editable homepage preview");
  const icon = editor.locator('img[alt=""]');
  await expect(editor.getByText("SportHub", { exact: true })).toBeVisible();
  const chooseLogo = async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Edit logo", exact: true }).click();
    await (await chooser).setFiles(imageFile);
  };
  const upload = page.waitForRequest((request) =>
    request.url().endsWith("/api/manager/media/images"),
  );
  await chooseLogo();
  expect((await upload).postDataBuffer()?.toString()).toContain(
    'name="preset"\r\n\r\nlogo',
  );
  await expect(icon).toBeVisible();
  await expect(icon.locator("..")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(icon.locator("..")).toHaveCSS("border-radius", "0px");
  await expect(
    editor.getByText("Only the icon changes. The SportHub name stays fixed."),
  ).toHaveCount(0);
  await expect(editor.getByText("SportHub", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Frame your image" }),
  ).toHaveCount(0);
  expect(calls.saves).toHaveLength(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const header = page
    .frameLocator('iframe[title="Draft homepage"]')
    .getByRole("banner")
    .getByRole("link", { name: "SportHub, homepage", exact: true });
  await expect(header.locator('img[alt=""]')).toHaveAttribute(
    "src",
    /hero-rally/,
  );
  await expect(header.getByText("SportHub", { exact: true })).toBeVisible();
  await expect(header.locator('img[alt=""]').locator("..")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(header.locator('img[alt=""]').locator("..")).toHaveCSS(
    "border-radius",
    "0px",
  );
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const mark = header.locator('img[alt=""]');
    const box = await mark.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(box!.height);
    expect(box!.width).toBeLessThanOrEqual(44);
    await expect(header.getByText("SportHub", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `test-results/media-logo-icon-${width}.png`,
    });
  }
  await page
    .getByRole("dialog", { name: "Homepage preview" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Changes are live", { exact: true }),
  ).toBeVisible();
  expect(calls.saves.at(-1)?.["brand.logo.image"]).toBe(uploadUrl);
  await page.reload();
  await expect(icon).toBeVisible();
  await expect(editor.getByText("SportHub", { exact: true })).toBeVisible();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", { name: "Edit logo", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/media-logo-pencil-${width}.png`,
    });
  }
  calls.uploadError = true;
  await chooseLogo();
  await expect(
    page.getByRole("alert").filter({ hasText: "Upload failed. Try again." }),
  ).toBeVisible();
  await expect(icon).toBeVisible();
  await expect(editor.getByText("SportHub", { exact: true })).toBeVisible();
  calls.uploadError = false;
  await chooseLogo();
  await expect.poll(() => calls.uploads).toBe(3);
  expect(calls.saves).toHaveLength(1);
});

test("featured coaches reorder by pointer and keyboard, replace individually and publish only after Apply and Save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const calls = await setup(page, { extraCoaches: true });
  await page
    .getByRole("button", { name: "Choose coaches", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Featured coaches",
    exact: true,
  });
  await expect(dialog.getByText("Adjust homepage image")).toHaveCount(0);
  await expect(dialog.getByText("Choose from your Coaches")).toHaveCount(0);
  const row = dialog.getByRole("list", { name: "Homepage display order" });
  const tops = await row
    .locator("li")
    .evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().top),
    );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  await dialog
    .getByRole("button", { name: "Reorder Alex Nguyen", exact: true })
    .press("ArrowRight");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(calls.saves).toHaveLength(0);
  await expect(page.locator("#media-bookmarks article h3")).toHaveText([
    "Alex Nguyen",
    "Minh Tran",
    "Linh Pham",
  ]);
  await page
    .getByRole("button", { name: "Choose coaches", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Featured coaches", exact: true });
  const start = await dialog
    .getByRole("button", { name: "Reorder Alex Nguyen", exact: true })
    .boundingBox();
  const end = await dialog
    .getByRole("button", { name: "Reorder Linh Pham", exact: true })
    .boundingBox();
  await page.mouse.move(
    start!.x + start!.width / 2,
    start!.y + start!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(dialog.locator("li [class*=identity] strong")).toHaveText([
    "Minh Tran",
    "Linh Pham",
    "Alex Nguyen",
  ]);
  await dialog
    .getByRole("button", { name: "Reorder Alex Nguyen", exact: true })
    .press("ArrowLeft");
  await expect(dialog.locator("li [class*=identity] strong")).toHaveText([
    "Minh Tran",
    "Alex Nguyen",
    "Linh Pham",
  ]);
  await dialog
    .getByRole("button", { name: "Change coach: Minh Tran", exact: true })
    .click();
  await dialog.getByRole("searchbox", { name: "Find a coach" }).fill("jordan");
  await dialog
    .getByRole("button", { name: "Choose Jordan Le", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Change coach: Jordan Le",
      exact: true,
    }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  expect(calls.saves).toHaveLength(0);
  await expect(page.locator("#media-bookmarks article h3")).toHaveText([
    "Jordan Le",
    "Alex Nguyen",
    "Linh Pham",
  ]);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(calls.saves[0]["bookmarks.coachIds"]).toBe(
    ["00000000-0000-4000-8000-000000000004", coachIds[0], coachIds[2]].join(
      ",",
    ),
  );
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
    "Published introduction",
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
  const calls = await setup(page, {
    sports: [],
    values: { "booking.image": "/sporthub/court-volt/course-basketball.png" },
  });
  await expect(page.locator("#media-gallery")).toContainText("Create a sport");
  await expect(page.locator("#media-gallery figure")).toHaveCount(0);
  await chooseImage(page, "Replace image: Court booking");
  await page.getByRole("button", { name: "Apply image", exact: true }).click();
  calls.galleryError = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("sporthub:sport-catalog-changed")),
  );
  await expect(
    page.getByRole("button", { name: "Retry sports" }),
  ).toBeVisible();
  await expect(page.locator("#media-booking img")).toHaveAttribute(
    "src",
    /hero-rally/,
  );
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
    .getByRole("button", { name: "Choose coaches", exact: true })
    .click();
  await page.screenshot({
    path: "../.impeccable/review/media-coaches-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("dialog", { name: "Featured coaches", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator("iframe")
      .locator('figure[data-sport-id="3"] img')
      .first(),
  ).toHaveAttribute("src", /hero-rally/);
  await page.screenshot({
    path: "../.impeccable/review/media-preview-desktop.png",
    animations: "disabled",
  });
  await page
    .frameLocator("iframe")
    .locator('[aria-labelledby="training-gallery-title"]')
    .scrollIntoViewIfNeeded();
  await expect(
    page.frameLocator("iframe").locator('[data-home-section="facilities"]'),
  ).not.toHaveAttribute("data-pending", "true");
  await expect(
    page.frameLocator("iframe").locator('[data-home-section="facilities"]'),
  ).toHaveCSS("opacity", "1");
  await expect
    .poll(() =>
      page
        .frameLocator("iframe")
        .locator('figure[data-sport-id="3"] img')
        .first()
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: "../.impeccable/review/media-preview-gallery-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("dialog", { name: "Homepage preview", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page.screenshot({
    path: "../.impeccable/review/media-restore-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("dialog", { name: "Restore original homepage?", exact: true })
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
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
    .getByRole("button", { name: "Choose coaches", exact: true })
    .click();
  await phone.screenshot({
    path: "../.impeccable/review/media-coaches-mobile.png",
    animations: "disabled",
  });
  await phone
    .getByRole("dialog", { name: "Featured coaches", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
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
  await phone.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    phone
      .frameLocator("iframe")
      .locator('figure[data-sport-id="3"] img')
      .first(),
  ).toHaveAttribute("src", /hero-rally/);
  await phone.screenshot({
    path: "../.impeccable/review/media-preview-mobile.png",
    animations: "disabled",
  });
  await phone
    .frameLocator("iframe")
    .locator('[aria-labelledby="training-gallery-title"]')
    .scrollIntoViewIfNeeded();
  await phone.screenshot({
    path: "../.impeccable/review/media-preview-gallery-mobile.png",
    animations: "disabled",
  });
  await phone
    .getByRole("dialog", { name: "Homepage preview", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await phone
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await phone.screenshot({
    path: "../.impeccable/review/media-restore-mobile.png",
    animations: "disabled",
  });
  await phone
    .getByRole("dialog", { name: "Restore original homepage?", exact: true })
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await mobile.close();
});

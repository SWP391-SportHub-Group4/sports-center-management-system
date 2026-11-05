import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 404, json: { message: "Fixture: no data" } }),
  );
}
const ready = (page: Page) =>
  expect(page.locator('[data-startup-phase="ready"]')).toHaveCount(1, {
    timeout: 16000,
  });

test("entry progress waits for critical media, reaches 100, then releases the hero", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/hero/objects/medicine-ball-3d.webp", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const progress = page.getByRole("progressbar", { name: "Loading SportHub" });
  await expect(progress).toBeVisible();
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(
    100,
  );
  await expect(page.locator("[data-startup-content]")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  // Record transitions independently of screenshot timing.
  await page.evaluate(() => {
    const samples: string[] = [];
    const host = document.querySelector("[data-startup-phase]")!;
    (window as typeof window & { startupPhases: string[] }).startupPhases =
      samples;
    new MutationObserver(() => {
      const phase = host.getAttribute("data-startup-phase")!;
      const progress = host
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow");
      samples.push(phase === "complete" ? `${phase}:${progress}` : phase);
    }).observe(host, {
      attributes: true,
      attributeFilter: ["data-startup-phase"],
    });
  });
  release();
  await ready(page);
  const phases = await page.evaluate(
    () => (window as typeof window & { startupPhases: string[] }).startupPhases,
  );
  expect(phases).toEqual(["complete:100", "revealing", "ready"]);
  await expect(page.locator("[data-startup-loader]")).toHaveCount(0);
  await expect(page.locator("[data-startup-content]")).not.toHaveAttribute(
    "inert",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  expect(
    await page
      .locator('[data-home-section="top"]')
      .evaluate((el) => getComputedStyle(el).transform),
  ).toBe("none");
  await page
    .getByRole("link", { name: "Sign in to get started", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("[data-startup-loader]")).toHaveCount(0);
  await page.getByLabel("Email").fill("member@example.test");
  await expect(page.getByLabel("Email")).toHaveValue("member@example.test");
});

test("failed media cannot trap the application behind its entry curtain", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/hero/objects/**", (route) => route.abort());
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByLabel("Email").fill("member@example.test");
  await expect(page.getByLabel("Email")).toHaveValue("member@example.test");
});

test("stalled media has a bounded entry wait", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/hero/objects/medicine-ball-3d.webp", async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await ready(page);
    await expect(page.getByLabel("Email")).toBeVisible();
  } finally {
    release();
  }
});

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [320, 740],
]) {
  test(`loading and reveal fit ${width}px with reduced motion`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-sport-loader="splash"] img')).toHaveCount(
      3,
    );
    await expect(
      page.locator('[data-sport-loader="splash"] img').first().locator(".."),
    ).toHaveCSS("animation-name", "none");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
      "BODY",
    );
  });
}

test("API activity stays until concurrent requests finish and clears on failure", async ({
  page,
}) => {
  await fixture(page);
  let releaseContent!: () => void;
  let releaseGallery!: () => void;
  const content = new Promise<void>((resolve) => {
    releaseContent = resolve;
  });
  const gallery = new Promise<void>((resolve) => {
    releaseGallery = resolve;
  });
  await page.route("**/api/landing-page", async (route) => {
    await content;
    await route.fulfill({
      json: { values: {}, revision: "test", updatedAt: null },
    });
  });
  await page.route("**/api/public/sports-gallery", async (route) => {
    await gallery;
    await route.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator("[data-request-activity]")).toBeVisible();
  releaseContent();
  await expect(page.locator("[data-request-activity]")).toBeVisible();
  releaseGallery();
  await expect(page.locator("[data-request-activity]")).toHaveCount(0);
});

test("the entry curtain does not hide the page when JavaScript is disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  // Check the server-rendered shell: streamed route content can stay inside
  // Next's Suspense fallback without JavaScript, independently of the curtain.
  await page.goto(`${baseURL}/`);
  await expect(page.locator("[data-startup-loader]")).toBeHidden();
  await expect(page.locator("[data-startup-content]")).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Footer" })).toBeVisible();
  await context.close();
});

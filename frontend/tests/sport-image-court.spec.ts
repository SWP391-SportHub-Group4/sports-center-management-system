import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { managerLayoutFixture } from "./helpers/manager-layout";

const photo = path.resolve("public/sporthub/court-volt/course-badminton.png");
const uploaded =
  "https://res.cloudinary.com/demo/image/upload/sporthub/media/sport-photo.jpg";
async function createForm(page: Page) {
  await managerLayoutFixture(page);
  await page.goto("/manager/sports");
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Create sport",
    exact: true,
  });
  await dialog.getByLabel("Code", { exact: true }).fill("tennis");
  await dialog.getByLabel("Name", { exact: true }).fill("Tennis");
  return dialog;
}
async function browse(page: Page, filename = photo) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Browse", exact: true }).click();
  await (await picker).setFiles(filename);
  await expect(
    page.locator('canvas[aria-label="Landing page image preview"]'),
  ).toBeVisible();
}

test("sport image is browsable, draggable and replaceable, then uploads its cropped frame on Save", async ({
  page,
}) => {
  const dialog = await createForm(page);
  let uploads = 0;
  const saves: Record<string, unknown>[] = [];
  await page.route("**/api/manager/media/images", async (route) => {
    uploads++;
    const body = route.request().postDataBuffer()!;
    expect(body.toString("latin1")).toContain('name="preset"\r\n\r\nlandscape');
    const start = body.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const end = body.lastIndexOf(Buffer.from([0xff, 0xd9]));
    expect(start).toBeGreaterThan(0);
    const dimensions = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
        );
        const size = [bitmap.width, bitmap.height];
        bitmap.close();
        return size;
      },
      Array.from(body.subarray(start, end + 2)),
    );
    expect(dimensions[0] / dimensions[1]).toBe(1.5);
    expect(dimensions[0]).toBeLessThanOrEqual(1800);
    return route.fulfill({ json: { url: uploaded } });
  });
  await page.route("**/api/manager/sports", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    saves.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await browse(page);
  await dialog.getByRole("slider", { name: /Zoom/ }).fill("1.5");
  const canvas = dialog.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 40,
    rect.y + rect.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .not.toBe(before);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog
      .getByRole("region", { name: "Landing page image", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.impeccable/review/sport-image-${width}.png`,
      animations: "disabled",
    });
  }
  expect(uploads).toBe(0);
  await browse(
    page,
    path.resolve("public/sporthub/court-volt/course-basketball.png"),
  );
  await expect(dialog.getByRole("slider", { name: /Zoom/ })).toHaveValue("1");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toBe(1);
  expect(saves).toEqual([
    expect.objectContaining({
      name: "Tennis",
      code: "tennis",
      imageUrl: uploaded,
    }),
  ]);
});

test("upload errors preserve the form and image, and Cancel never uploads", async ({
  page,
}) => {
  const dialog = await createForm(page);
  let uploads = 0,
    saves = 0;
  await page.route("**/api/manager/media/images", (route) => {
    uploads++;
    return uploads === 1
      ? route.fulfill({
          status: 503,
          json: {
            code: "media_upload_failed",
            message: "Image storage is unavailable. Try again.",
          },
        })
      : route.fulfill({ json: { url: uploaded } });
  });
  await page.route("**/api/manager/sports", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    saves++;
    return route.fulfill({ json: {} });
  });
  await browse(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText("Image storage is unavailable. Try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Tennis",
  );
  await expect(dialog.locator("canvas")).toBeVisible();
  expect(saves).toBe(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  await browse(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(uploads).toBe(2);
});

test("invalid local images show an error and do not upload", async ({
  page,
}) => {
  const dialog = await createForm(page);
  const input = dialog.locator('input[type="file"]');
  await input.setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Choose a JPG, PNG or WebP",
  );
  await input.setInputFiles({
    name: "corrupt.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not open this image",
  );
  await expect(dialog.getByRole("button", { name: "Browse" })).toBeEnabled();
});

test("court list opens details and keeps editing inside Edit court", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  let name = "Court A";
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/rooms", (route) =>
    route.fulfill({
      json: [
        {
          roomId: 1,
          name,
          capacity: 12,
          sportId: 3,
          roomTypeId: 3,
          isActive: true,
        },
      ],
    }),
  );
  await page.route("**/api/rooms/1", (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    name = body.name;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/manager/facilities");
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "View details", exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/facilities\/1/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit court", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill("Court A updated");
  await dialog.getByRole("switch").uncheck();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    expect.objectContaining({ name: "Court A updated", isActive: false }),
  ]);
});

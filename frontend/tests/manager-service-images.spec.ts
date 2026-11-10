import { expect, test, type Page } from "@playwright/test";
import type {
  ServiceGallery,
  ServiceImage,
} from "../src/features/service-media/types";

const endpoint = "/api/manager/service-images/membership/1";
const photo = (imageId: string, sortOrder: number): ServiceImage => ({
  imageId,
  sortOrder,
  url: "/sporthub/activity-fitness.jpg",
  altText: `Photo ${imageId}`,
  width: 1200,
  height: 800,
});
const initial: ServiceGallery = {
  kind: "membership",
  id: 1,
  version: "v1",
  coverImageId: "first",
  images: [photo("first", 0), photo("second", 1)],
};
type SaveBody = {
  version: string;
  imageIds: string[];
  coverImageId: string | null;
  altTexts: Record<string, string>;
};

async function setup(
  page: Page,
  options: { role?: string; forbidden?: boolean } = {},
) {
  const state = {
    gallery: structuredClone(initial),
    uploads: 0,
    saves: [] as SaveBody[],
    deletes: [] as string[],
    protectedReads: [] as string[],
    multipart: "",
    conflict: false,
  };
  const known = new Map(initial.images.map((image) => [image.imageId, image]));
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "manager-1",
        fullName: "Center Manager",
        email: "manager@example.com",
        role: options.role ?? "CENTER_MANAGER",
        sportIds: [],
      });
    if (path === "/api/membership-packages") {
      state.protectedReads.push(path);
      return json([
        {
          packageId: 1,
          name: "Gym Membership",
          description: "Gym access",
          price: 600000,
          durationDays: 30,
          isActive: true,
          sessionLimit: null,
        },
      ]);
    }
    if (path === endpoint && request.method() === "GET") {
      state.protectedReads.push(path);
      return options.forbidden
        ? route.fulfill({
            status: 403,
            json: {
              error: "forbidden",
              message: "You cannot manage these images.",
            },
          })
        : json(state.gallery);
    }
    if (path === endpoint && request.method() === "POST") {
      state.uploads++;
      state.multipart = request.postDataBuffer()?.toString("latin1") ?? "";
      const uploaded = photo("uploaded", state.gallery.images.length);
      known.set(uploaded.imageId, uploaded);
      return json(uploaded);
    }
    if (path === endpoint && request.method() === "PUT") {
      const body = request.postDataJSON() as SaveBody;
      state.saves.push(body);
      if (state.conflict) {
        state.conflict = false;
        state.gallery = {
          ...state.gallery,
          version: "v2",
          images: state.gallery.images.map((image, index) =>
            index === 0 ? { ...image, altText: "Server edit" } : image,
          ),
        };
        return route.fulfill({
          status: 409,
          json: {
            error: "service_images_changed",
            message: "Another manager changed these images.",
          },
        });
      }
      state.gallery = {
        ...state.gallery,
        version: body.version === "v2" ? "v3" : "v2",
        coverImageId: body.coverImageId,
        images: body.imageIds.map((imageId, sortOrder) => ({
          ...known.get(imageId)!,
          sortOrder,
          altText: body.altTexts[imageId],
        })),
      };
      return json(state.gallery);
    }
    if (path.startsWith(`${endpoint}/`) && request.method() === "DELETE") {
      state.deletes.push(path.split("/").at(-1)!);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("unread-count")) return json({ count: 0 });
    return json([]);
  });
  return state;
}

async function stagePhoto(page: Page) {
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#086d73";
    context.fillRect(0, 0, 1200, 800);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload service photo", { exact: true }).setInputFiles({
    name: "service-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const crop = page.getByRole("dialog", { name: "Frame your image" });
  await expect(crop).toBeVisible();
  const canvas = crop.getByLabel("Image crop preview");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    crop.getByRole("slider", { name: /Horizontal position/ }),
  ).toHaveValue("49");
  await crop.getByRole("button", { name: "Apply image", exact: true }).click();
  await expect(crop).toHaveCount(0);
  await expect(
    page.getByLabel("Photo 3 description", { exact: true }),
  ).toBeVisible();
}

test("upload remains staged until save publishes the ordered gallery", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/manager/service-images/membership/1");
  await stagePhoto(page);
  expect(state.uploads).toBe(1);
  expect(state.saves).toHaveLength(0);
  expect(state.gallery.images).toHaveLength(2);
  expect(state.multipart).toContain(
    'name="file"; filename="service-photo.jpg"',
  );
  expect(state.multipart).toContain("Content-Type: image/jpeg");
  await page
    .getByLabel("Photo 3 description", { exact: true })
    .fill("The Gym training floor");
  await page
    .getByRole("button", { name: "Set photo 3 as cover", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Images saved. Members can now see these photos.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.saves).toEqual([
    {
      version: "v1",
      imageIds: ["first", "second", "uploaded"],
      coverImageId: "uploaded",
      altTexts: {
        first: "Photo first",
        second: "Photo second",
        uploaded: "The Gym training floor",
      },
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }).first(),
  ).toBeDisabled();
});

test("keyboard reordering keeps the selected cover and preview returns focus on Escape", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/manager/service-images/membership/1");
  await page
    .getByRole("button", { name: "Set photo 2 as cover", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move photo 2 earlier", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Photo 1 description", { exact: true }),
  ).toHaveValue("Photo second");
  await expect(
    page.getByRole("button", { name: "Set photo 1 as cover", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const preview = page.getByRole("button", { name: "Preview", exact: true });
  await preview.click();
  await expect(
    page.getByRole("dialog", { name: "Member preview", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(preview).toBeFocused();
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].imageIds).toEqual(["second", "first"]);
  expect(state.saves[0].coverImageId).toBe("second");
});

test("a 409 preserves edits and reloading allows an explicit retry with the latest version", async ({
  page,
}) => {
  const state = await setup(page);
  state.conflict = true;
  await page.goto("/manager/service-images/membership/1");
  await page
    .getByLabel("Photo 1 description", { exact: true })
    .fill("Unsaved local edit");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Reload latest images", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Photo 1 description", { exact: true }),
  ).toHaveValue("Unsaved local edit");
  await page
    .getByRole("button", { name: "Reload latest images", exact: true })
    .click();
  const discard = page.getByRole("button", {
    name: "Discard changes",
    exact: true,
  });
  if (await discard.count()) await discard.click();
  await expect(
    page.getByLabel("Photo 1 description", { exact: true }),
  ).toHaveValue("Server edit");
  await page
    .getByLabel("Photo 1 description", { exact: true })
    .fill("Reviewed latest edit");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[1].version).toBe("v2");
  await expect(
    page.getByText("Images saved. Members can now see these photos.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("discard deletes staged uploads and leaves the saved gallery intact", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/manager/service-images/membership/1");
  await stagePhoto(page);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  const discard = page.getByRole("dialog", {
    name: "Discard image changes?",
    exact: true,
  });
  await discard
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/manager\/membership-plans$/);
  expect(state.deletes).toEqual(["uploaded"]);
  expect(state.saves).toHaveLength(0);
  expect(state.gallery).toEqual(initial);
});

test("member authorization blocks protected image requests", async ({
  page,
}) => {
  const state = await setup(page, { role: "MEMBER" });
  await page.goto("/manager/service-images/membership/1");
  await expect(page).toHaveURL(/\/member$/);
  expect(state.protectedReads).toEqual([]);
  expect(state.saves).toHaveLength(0);
});

test("403 photo access is explained without editable controls", async ({
  page,
}) => {
  await setup(page, { forbidden: true });
  await page.goto("/manager/service-images/membership/1");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "You cannot manage these images." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload photos", exact: true }),
  ).toHaveCount(0);
});

test("320px editor remains within the viewport and provides full-size gallery controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await setup(page);
  await page.goto("/manager/service-images/membership/1");
  await expect(
    page.getByLabel("Photo 1 description", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  for (const name of ["Move photo 1 later", "Remove photo 1"]) {
    const bounds = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
});

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

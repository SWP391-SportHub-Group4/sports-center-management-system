import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, conflictOnSave = false) {
  const sports = [
    {
      sportId: 1,
      code: "bong_ban",
      name: "Table tennis",
      isActive: false,
      sortOrder: 1,
      services: [],
    },
  ];
  const writes: Record<string, unknown>[] = [];
  let reject = conflictOnSave;
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Manager",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (url.pathname === "/api/manager/sports/name-availability") {
      const name = url.searchParams.get("name")!;
      const code = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 32);
      return route.fulfill({
        json: {
          name,
          isValid: !!code,
          isAvailable: !sports.some(
            (s) =>
              String(s.sportId) !== url.searchParams.get("excludeSportId") &&
              (s.name.toLowerCase() === name.toLowerCase() ||
                (!url.searchParams.has("excludeSportId") && s.code === code)),
          ),
        },
      });
    }
    if (
      url.pathname === "/api/manager/sports" ||
      /^\/api\/manager\/sports\/\d+$/.test(url.pathname)
    ) {
      if (request.method() === "GET") return route.fulfill({ json: sports });
      const body = request.postDataJSON();
      writes.push(body);
      if (reject) {
        reject = false;
        return route.fulfill({
          status: 409,
          json: {
            error: "sport_code_taken",
            message: "This sport already exists.",
          },
        });
      }
      const saved = {
        ...sports[0],
        ...body,
        sportId: request.method() === "POST" ? 2 : 1,
        code: request.method() === "POST" ? "volleyball" : sports[0].code,
      };
      if (request.method() === "POST") sports.push(saved);
      else sports[0] = saved;
      return route.fulfill({ json: saved });
    }
    return route.fulfill({
      json: url.pathname.endsWith("unread-count") ? { count: 0 } : [],
    });
  });
  return writes;
}

for (const width of [1440, 390]) {
  test(`sport creation reports duplicate generated code at the name field before saving at ${width}px`, async ({
    page,
  }, testInfo) => {
    const writes = await setup(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/manager/sports");
    await page
      .getByRole("button", { name: "Create sport", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Code", { exact: true })).toHaveCount(0);
    const name = dialog.getByLabel("Name", { exact: true });
    await name.fill("Bóng bàn");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("alert")).toHaveText(
      "This sport already exists.",
    );
    await expect(
      dialog.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    expect(writes).toHaveLength(0);
    await page.screenshot({
      path: testInfo.outputPath(`duplicate-sport-${width}.png`),
      fullPage: true,
    });
    await name.fill("Volleyball");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toHaveProperty("code");
    expect(writes[0].name).toBe("Volleyball");
  });
}

test("a collision detected at save stays under Name and clears when corrected", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto("/manager/sports");
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("New sport");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This sport already exists.",
  );
  await dialog.getByLabel("Name", { exact: true }).fill("Volleyball");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("renaming an existing sport never submits a replacement code", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/manager/sports");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Code", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Name", { exact: true }).fill("Renamed table tennis");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).not.toHaveProperty("code");
  await expect(page.getByRole("table")).toContainText("bong_ban");
});

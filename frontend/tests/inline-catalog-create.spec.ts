import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const sports = [
    {
      sportId: 1,
      code: "badminton",
      name: "Badminton",
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
  ];
  const rooms: Record<string, unknown>[] = [
    {
      roomId: 70,
      name: "Shared room",
      capacity: 12,
      roomTypeId: 51,
      isActive: true,
      allowRental: false,
    },
  ];
  const writes: string[] = [];
  let reject = true;
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "inline-fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (data: unknown) => route.fulfill({ json: data });
    if (path === "/api/users/me")
      return json({
        userId: "manager",
        role: "CENTER_MANAGER",
        fullName: "Manager",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/system-settings")
      return json([
        { key: "center.opening_minutes", value: "360" },
        { key: "center.closing_minutes", value: "1320" },
      ]);
    if (req.method() === "POST") {
      writes.push(path);
      const body = req.postDataJSON();
      if (path === "/api/manager/sports") {
        if (reject) {
          reject = false;
          return route.fulfill({
            status: 409,
            json: { error: "sport_code_taken", message: "Duplicate code" },
          });
        }
        const sport = { ...body, sportId: sports.length + 1 };
        sports.push(sport);
        return json(sport);
      }
      if (path === "/api/rooms") {
        const room = {
          ...body,
          roomId: 71,
          roomTypeId: 51,
          isActive: true,
          activeClassCount: 0,
        };
        rooms.push(room);
        return json(room);
      }
    }
    if (path === "/api/manager/classes")
      return json({ items: [], totalCount: 0, page: 1, pageSize: 100 });
    if (path === "/api/sports" || path === "/api/manager/sports")
      return json(sports);
    if (path === "/api/rooms") return json(rooms);
    if (path === "/api/room-types")
      return json([
        {
          roomTypeId: 51,
          sportIds: sports.map((s) => s.sportId),
          isActive: true,
        },
      ]);
    return json([]);
  });
  return writes;
}

async function saveSport(page: Page, name: string, code: string) {
  const dialog = page.getByRole("dialog", {
    name: "Create sport",
    exact: true,
  });
  await dialog.getByLabel("Code", { exact: true }).fill(code);
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Code", { exact: true }).fill(`${code}_new`);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("room creation only asks for physical room details", async ({ page }) => {
  const writes = await setup(page);
  await page.goto("/manager/facilities");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Sport", { exact: true })).toHaveCount(0);
  await dialog.getByLabel(/^Name/).fill("New multipurpose room");
  await dialog.getByLabel(/^Capacity/).fill("20");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("rowheader", { name: "New multipurpose room" }),
  ).toBeVisible();
  expect(writes).toEqual(["/api/rooms"]);
});

test("class creates a sport inline and selects an existing shared room", async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto("/manager/classes/new");
  await page.getByLabel("Code", { exact: true }).fill("CLASS-NEW");
  await page.getByLabel("Name", { exact: true }).fill("Class draft");
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  await saveSport(page, "Tennis", "tennis");
  await expect(page.getByLabel("Sport", { exact: true })).toHaveValue("2");
  await page
    .getByLabel("Session duration (minutes)", { exact: true })
    .fill("90");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create rental court", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Room", { exact: true })
      .getByRole("option", { name: /Shared room/ }),
  ).toHaveCount(1);
  await page.getByLabel("Room", { exact: true }).selectOption("70");
  await expect(
    page.getByRole("link", { name: "Manage rooms", exact: true }),
  ).toHaveAttribute("href", "/manager/facilities");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Class draft",
  );
  expect(writes).toEqual(["/api/manager/sports", "/api/manager/sports"]);
});

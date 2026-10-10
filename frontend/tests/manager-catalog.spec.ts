import { toggleHeaderLanguage } from "./helpers/language";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { SportDto } from "../src/lib/types";

const sport: SportDto = {
  sportId: 41,
  code: "basketball",
  name: "Basketball",
  services: [
    {
      serviceType: "GROUP_COURSE",
      isEnabled: true,
      defaultSessionMinutes: 90,
      defaultMaxCapacity: 12,
    },
  ],
  readiness: [
    { serviceType: "GROUP_COURSE", ready: false, missing: ["opening_hours"] },
  ],
  description: "Team sessions",
  imageUrl: null,
  sortOrder: 4,
  isActive: true,
};
const gym = {
  packageId: 71,
  name: "Gym 30 days",
  price: 300000,
  durationDays: 30,
  description: "Unlimited Gym",
  sessionLimit: null,
  isActive: false,
};
const rate = {
  rateId: 91,
  roomTypeId: 51,
  sportId: 41,
  daysOfWeek: "MON,TUE",
  startTimeLocal: "06:00",
  endTimeLocal: "12:00",
  pricePerHour: 100000,
  isActive: true,
};
type Write = {
  path: string;
  method: string;
  body: Record<string, unknown> | null;
};
async function setup(
  page: Page,
  options: {
    role?: string;
    fail?: number;
    code?: string;
    empty?: boolean;
    slow?: boolean;
  } = {},
) {
  const data = {
    sports: options.empty ? [] : [structuredClone(sport)],
    packages: options.empty ? [] : [structuredClone(gym)],
    rates: options.empty ? [] : [structuredClone(rate)],
    pt: { pricePerSessionVnd: 250000, priceVersion: "v-original" },
  };
  const writes: Write[] = [];
  const reads: Record<string, number> = {};
  let fail = options.fail ?? 0;
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() !== "GET") {
      const body = req.postDataJSON() as Record<string, unknown> | null;
      writes.push({ path, method: req.method(), body });
      if (options.slow)
        await new Promise((resolve) => setTimeout(resolve, 350));
      if (fail)
        return route.fulfill({
          status: fail,
          json: {
            error: options.code ?? "invalid_price",
            message: "Server validation rejected the change",
          },
        });
      if (path === "/api/manager/pt-pricing")
        data.pt = {
          pricePerSessionVnd: Number(body?.value),
          priceVersion: "v-updated",
        };
      else if (path.startsWith("/api/manager/sports")) {
        if (path.endsWith("activate"))
          data.sports[0].isActive = path.endsWith("/activate");
        else if (req.method() === "POST")
          data.sports.push({ ...sport, ...body, sportId: 42 } as typeof sport);
        else Object.assign(data.sports[0], body);
      } else if (path.startsWith("/api/membership-packages")) {
        if (path.endsWith("reactivate") || path.endsWith("discontinue"))
          data.packages[0].isActive = path.endsWith("reactivate");
        else if (req.method() === "POST")
          data.packages.push({
            ...gym,
            ...body,
            packageId: 72,
            isActive: true,
          } as typeof gym);
        else Object.assign(data.packages[0], body);
      } else if (path.startsWith("/api/manager/court-rates")) {
        const updated = {
          ...rate,
          ...body,
          daysOfWeek: (body?.daysOfWeek as string[]).join(","),
        };
        if (req.method() === "POST")
          data.rates.push({ ...updated, rateId: 92 } as typeof rate);
        else Object.assign(data.rates[0], updated);
      }
      return route.fulfill({ json: { ok: true } });
    }
    reads[path] = (reads[path] ?? 0) + 1;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Manager fixture",
          email: "manager@example.com",
          role: options.role ?? "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path === "/api/sports" || path === "/api/manager/sports")
      return route.fulfill({ json: data.sports });
    if (path === "/api/membership-packages")
      return route.fulfill({ json: data.packages });
    if (path === "/api/manager/court-rates")
      return route.fulfill({ json: data.rates });
    if (path === "/api/pt-pricing") return route.fulfill({ json: data.pt });
    if (path === "/api/room-types")
      return route.fulfill({
        json: [
          { roomTypeId: 51, name: "Court", sportIds: [41] },
          { roomTypeId: 52, name: "Studio", sportIds: [] },
        ],
      });
    if (path.includes("notifications")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "fixture_missing" } });
  });
  return {
    data,
    writes,
    reads,
    recover: () => {
      fail = 0;
    },
  };
}
const row = (page: Page, name: string) =>
  page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) });
const dialog = (page: Page) => page.getByRole("dialog");

test("sport creation uses service contract, reloads, and edits with immutable code", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/catalog?tab=sports");
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("New Gym");
  await dialog(page).getByLabel("Code", { exact: true }).fill("gym");
  await dialog(page).getByLabel("Group courses", { exact: true }).uncheck();
  await dialog(page).getByLabel("Membership", { exact: true }).check();
  await dialog(page).getByLabel("Personal training", { exact: true }).check();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(row(page, "New Gym")).toBeVisible();
  expect(fixture.writes[0]).toMatchObject({
    path: "/api/manager/sports",
    method: "POST",
    body: {
      name: "New Gym",
      code: "gym",
      services: [
        {
          serviceType: "MEMBERSHIP_ACCESS",
          isEnabled: true,
          defaultSessionMinutes: null,
          defaultMaxCapacity: null,
        },
        {
          serviceType: "PERSONAL_TRAINING",
          isEnabled: true,
          defaultSessionMinutes: null,
          defaultMaxCapacity: null,
        },
      ],
    },
  });
  await row(page, "Basketball")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(dialog(page).getByLabel("Code", { exact: true })).toBeDisabled();
  await expect(
    dialog(page).getByLabel("Display order", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog(page).getByLabel("Membership", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog(page).getByLabel("Personal training", { exact: true }),
  ).toHaveCount(0);
  await dialog(page).getByLabel("Court rental", { exact: true }).check();
  await expect(dialog(page).getByText("Court", { exact: true })).toBeVisible();
  await dialog(page)
    .getByLabel("Name", { exact: true })
    .fill("Basketball updated");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(row(page, "Basketball updated")).toBeVisible();
  expect(fixture.writes[1]).toMatchObject({
    path: "/api/manager/sports/41",
    method: "PUT",
    body: {
      services: [
        {
          serviceType: "GROUP_COURSE",
          isEnabled: true,
          defaultSessionMinutes: 90,
          defaultMaxCapacity: 12,
        },
        {
          serviceType: "COURT_RENTAL",
          isEnabled: true,
          defaultSessionMinutes: null,
          defaultMaxCapacity: null,
        },
      ],
    },
  });
  expect(fixture.writes[0].body).not.toHaveProperty("sortOrder");
  expect(fixture.writes[1].body).not.toHaveProperty("sortOrder");
  expect(fixture.writes[1].body).not.toHaveProperty("code");
  expect(fixture.writes[1].body).not.toHaveProperty("operationType");
});

test("sport readiness and disabled services are visible; server errors keep service draft for retry", async ({
  page,
}) => {
  const fixture = await setup(page, { fail: 409, code: "sport_name_taken" });
  fixture.data.sports[0].services.push({
    serviceType: "COURT_RENTAL",
    isEnabled: false,
    defaultSessionMinutes: null,
    defaultMaxCapacity: null,
  });
  await page.goto("/manager/catalog?tab=sports");
  await expect(row(page, "Basketball")).toContainText(
    "Not ready to sell. Missing: opening hours",
  );
  await expect(row(page, "Basketball")).toContainText("Court rental (Off)");
  await row(page, "Basketball")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await dialog(page).getByLabel("Group courses", { exact: true }).uncheck();
  await dialog(page).getByLabel("Court rental", { exact: true }).check();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toBeVisible();
  await expect(
    dialog(page).getByLabel("Court rental", { exact: true }),
  ).toBeChecked();
  await expect(
    dialog(page).getByLabel("Group courses", { exact: true }),
  ).not.toBeChecked();
  fixture.recover();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[1].body?.services).toEqual([
    {
      serviceType: "COURT_RENTAL",
      isEnabled: true,
      defaultSessionMinutes: null,
      defaultMaxCapacity: null,
    },
  ]);
});

test("Gym creates, edits without changing active state, and reactivates via the dedicated endpoint", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/membership-plans");
  await row(page, "Gym 30 days")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await dialog(page).getByLabel("Price (VND)", { exact: true }).fill("330000");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(row(page, "Gym 30 days")).toContainText("330");
  expect(fixture.writes[0]).toMatchObject({
    path: "/api/membership-packages/71",
    body: { price: 330000, sessionLimit: null },
  });
  expect(fixture.writes[0].body).not.toHaveProperty("isActive");
  await row(page, "Gym 30 days")
    .getByRole("button", { name: "Activate", exact: true })
    .click();
  expect(fixture.writes).toHaveLength(1);
  await dialog(page)
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[1].path).toBe("/api/membership-packages/71/reactivate");
  await page
    .getByRole("button", { name: "Create Gym package", exact: true })
    .click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Gym 60 days");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(row(page, "Gym 60 days")).toBeVisible();
});

test("PT displays and reloads the current price without technical versions and only uses the supported PUT", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/catalog?tab=pt");
  await expect(page.getByText("250,000", { exact: false })).toBeVisible();
  await expect(page.getByText("v-original", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog(page)
    .getByLabel("PT price per session (VND)", { exact: true })
    .fill("280000");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("280,000", { exact: false })).toBeVisible();
  await expect(page.getByText("v-updated", { exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([
    {
      path: "/api/manager/pt-pricing",
      method: "PUT",
      body: { value: "280000" },
    },
  ]);
});

test("court-rate creation validates days/window and uses actual compatible IDs", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/court-rates");
  await page
    .getByRole("button", { name: "Create court rate", exact: true })
    .click();
  await dialog(page)
    .getByLabel("Room type", { exact: true })
    .selectOption("51");
  await dialog(page).getByLabel("Sport", { exact: true }).selectOption("41");
  await dialog(page).getByLabel("Monday", { exact: true }).uncheck();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText(
    "Select at least one day.",
  );
  expect(fixture.writes).toHaveLength(0);
  await dialog(page).getByLabel("Tuesday", { exact: true }).check();
  await dialog(page).getByLabel("End", { exact: true }).fill("05:00");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText(
    "The end time must be after the start time.",
  );
  await dialog(page).getByLabel("End", { exact: true }).fill("08:00");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[0]).toMatchObject({
    path: "/api/manager/court-rates",
    method: "POST",
    body: {
      roomTypeId: 51,
      sportId: 41,
      daysOfWeek: ["TUE"],
      startTimeLocal: "06:00",
      endTimeLocal: "08:00",
    },
  });
  await expect
    .poll(() => fixture.reads["/api/manager/court-rates"])
    .toBeGreaterThan(1);
});

test("court activation PUT preserves the whole existing rate; cancel never writes", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/court-rates");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[0]).toEqual({
    path: "/api/manager/court-rates/91",
    method: "PUT",
    body: {
      roomTypeId: 51,
      sportId: 41,
      daysOfWeek: ["MON", "TUE"],
      startTimeLocal: "06:00",
      endTimeLocal: "12:00",
      pricePerHour: 100000,
      isActive: false,
    },
  });
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toBeVisible();
});

for (const [status, code] of [
  [400, "invalid_price"],
  [409, "court_rate_overlap"],
  [403, "forbidden"],
  [404, "court_rate_not_found"],
] as const) {
  test(`API ${status} keeps court-rate form and changes; retry succeeds`, async ({
    page,
  }) => {
    const fixture = await setup(page, { fail: status, code });
    await page.goto("/manager/catalog?tab=court-rates");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog(page)
      .getByLabel("Price per hour (VND)", { exact: true })
      .fill("150000");
    await dialog(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    await expect(dialog(page).getByText(code, { exact: true })).toHaveCount(0);
    await expect(
      dialog(page).getByLabel("Price per hour (VND)", { exact: true }),
    ).toHaveValue("150000");
    expect(fixture.reads["/api/manager/court-rates"]).toBe(1);
    fixture.recover();
    await dialog(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(dialog(page)).toHaveCount(0);
  });
}

test("filters and aliases survive reload; sport confirm issues a single mutation", async ({
  page,
}) => {
  const fixture = await setup(page, { slow: true });
  await page.goto("/manager/sports?q=Basket&status=active&keep=bookmark");
  await expect(row(page, "Basketball")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue(
    "Basket",
  );
  await row(page, "Basketball")
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "Confirm", exact: true })
    .dblclick();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].path).toBe("/api/manager/sports/41/deactivate");
  await expect(
    page.getByText("No matching items", { exact: true }),
  ).toBeVisible();
  expect(page.url()).toContain("keep=bookmark");
});

test("Gym native price validation prevents zero, negative and non-multiple prices", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/catalog?tab=gym");
  await page
    .getByRole("button", { name: "Create Gym package", exact: true })
    .click();
  await dialog(page).getByLabel("Name", { exact: true }).fill("Valid name");
  for (const value of ["0", "-1000", "1001"]) {
    await dialog(page).getByLabel("Price (VND)", { exact: true }).fill(value);
    await dialog(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    expect(fixture.writes).toHaveLength(0);
    await expect(dialog(page)).toBeVisible();
  }
});

for (const [tab, code, priceLabel] of [
  ["gym", "package_name_taken", "Price (VND)"],
  ["pt", "invalid_setting_value", "PT price per session (VND)"],
] as const) {
  test(`${tab} shows server validation and retains draft values`, async ({
    page,
  }) => {
    const fixture = await setup(page, { fail: 400, code });
    await page.goto("/manager/catalog?tab=" + tab);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog(page).getByLabel(priceLabel, { exact: true }).fill("350000");
    await dialog(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    await expect(dialog(page).getByText(code, { exact: true })).toHaveCount(0);
    await expect(
      dialog(page).getByLabel(priceLabel, { exact: true }),
    ).toHaveValue("350000");
    fixture.recover();
    await dialog(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(dialog(page)).toHaveCount(0);
  });
}

test("failed room-type reference load prevents unsafe rate edits, retry restores them", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/room-types", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "reference_unavailable",
        message: "Room types unavailable",
      },
    }),
  );
  await page.goto("/manager/catalog?tab=court-rates");
  await expect(
    page.getByRole("alert").filter({ hasText: "Room types unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create court rate", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/room-types");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create court rate", exact: true }),
  ).toBeEnabled();
});

test("empty room-type catalog explains the prerequisite and prevents rate creation", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/room-types", (route) => route.fulfill({ json: [] }));
  await page.goto("/manager/catalog?tab=court-rates");
  await expect(
    page.getByText(
      "No compatible room types are configured. Compatibility is managed in Room types.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create court rate", exact: true }),
  ).toBeDisabled();
});

test("Gym stop-selling and sport activation use the supported endpoints", async ({
  page,
}) => {
  const fixture = await setup(page);
  fixture.data.packages[0].isActive = true;
  fixture.data.sports[0].isActive = false;
  await page.goto("/manager/catalog?tab=gym");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[0].path).toBe(
    "/api/membership-packages/71/discontinue",
  );
  await page.goto("/manager/catalog?tab=sports");
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  expect(fixture.writes[1].path).toBe("/api/manager/sports/41/activate");
});

for (const role of ["MEMBER", "SYSTEM_ADMINISTRATOR"])
  test(`catalog denies ${role}`, async ({ page }) => {
    const fixture = await setup(page, { role });
    await page.goto("/manager/catalog");
    await expect(
      page.getByRole("button", { name: "Create sport", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(
      role === "MEMBER" ? /\/member(?:\?|$)/ : /\/admin(?:\?|$)/,
    );
    expect(fixture.reads["/api/manager/sports"] ?? 0).toBe(0);
    expect(fixture.writes).toHaveLength(0);
  });

test("empty catalog can create; unknown queries keep the default sports tab", async ({
  page,
}) => {
  await setup(page, { empty: true });
  await page.goto("/manager/catalog?tab=unknown");
  await expect(
    page.getByText("No matching items", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sports", exact: true }).last(),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Create sport", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
});

test("mobile tabs, tables and forms fit and English/Vietnamese labels are accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/manager/catalog?tab=court-rates");
    await expect(
      page.getByRole("button", { name: "Create court rate", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Create court rate", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) {
      const results = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      // Ảnh minh chứng: lỗi ghi tệp không làm hỏng phép kiểm tra.
      await page
        .screenshot({
          path: "../output/manager-catalog-mobile.png",
          fullPage: true,
        })
        .catch(() => undefined);
    }
    await page.goto("/manager/catalog?tab=sports");
    await page
      .getByRole("button", { name: "Create sport", exact: true })
      .click();
    await dialog(page).getByLabel("Code", { exact: true }).fill("gym");
    await expect(
      dialog(page).getByLabel("Membership", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      await page
        .screenshot({
          path: `../output/merge-sport-form-${width}.png`,
          fullPage: true,
          animations: "disabled",
        })
        .catch(() => undefined);
    }
    if (width === 390) {
      const results = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  }
  await page.goto("/manager/catalog?tab=pt");
  await toggleHeaderLanguage(page);
  await expect(
    page.getByText("Huấn luyện cá nhân · Dịch vụ Gym", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Phiên bản giá", { exact: true })).toHaveCount(0);
});

test("live Manager API list contracts and aliases match the rendered catalog", async ({
  page,
  request,
}) => {
  const apiBase = process.env.P2_LIVE_API;
  test.skip(!apiBase, "Set P2_LIVE_API for read-only live verification");
  const response = await request.post(apiBase + "/api/auth/login", {
    data: { email: "manager@sporthub.vn", password: "Sporthub@123" },
  });
  expect(response.ok()).toBe(true);
  const login = await response.json();
  await page.addInitScript((token) => {
    localStorage.setItem("sporthub.accessToken", token);
    localStorage.setItem("sporthub_lang", "vi");
  }, login.accessToken);
  for (const [endpoint, path] of [
    ["/api/manager/sports", "/manager/sports"],
    [
      "/api/membership-packages?includeInactive=true",
      "/manager/membership-plans",
    ],
    ["/api/pt-pricing", "/manager/catalog?tab=pt"],
    ["/api/manager/court-rates", "/manager/court-rates"],
  ]) {
    const result = await request.get(apiBase + endpoint, {
      headers: { Authorization: "Bearer " + login.accessToken },
    });
    expect(result.ok()).toBe(true);
    const body = await result.json();
    await page.goto(path);
    if (Array.isArray(body) && !body.length) {
      await expect(
        page.getByText("Không có mục phù hợp", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("table")).toBeVisible();
    }
    if (Array.isArray(body) && body.length && body[0].name)
      await expect(
        page.getByRole("rowheader", { name: body[0].name, exact: true }),
      ).toBeVisible();
    if (!Array.isArray(body))
      await expect(
        page.getByText(body.priceVersion, { exact: true }),
      ).toBeVisible();
  }
  await page.goto("/manager/catalog?tab=gym");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tạo gói Gym", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "../output/manager-catalog-live.png",
    fullPage: true,
  });
});

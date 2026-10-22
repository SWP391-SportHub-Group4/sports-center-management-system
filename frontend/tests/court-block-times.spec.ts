import { expect, test, type Page } from "@playwright/test";
import type { CourtRateDto, RoomBlockDto } from "../src/lib/types";

const blockId = "11111111-2222-4333-8444-555555555555";
const userId = "22222222-2222-4333-8444-555555555555";
const block: RoomBlockDto = {
  blockId,
  roomId: 7,
  startAtUtc: "2031-03-03T02:00:00Z",
  endAtUtc: "2031-03-03T04:00:00Z",
  reason: "Floor maintenance",
  incidentId: null,
  createdByUserId: userId,
};
const rate: CourtRateDto = {
  rateId: 1,
  roomId: null,
  roomTypeId: 3,
  sportId: 1,
  daysOfWeek: "MON,TUE,WED,THU,FRI,SAT,SUN",
  startTimeLocal: "06:00",
  endTimeLocal: "22:00",
  pricePerHour: 50000,
  isActive: true,
};

async function setup(page: Page, initial: RoomBlockDto[] = []) {
  const data = { blocks: [...initial], rates: [rate] };
  const writes: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-manager");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      const body = req.postData() ? req.postDataJSON() : null;
      writes.push({ path, method: req.method(), body });
      if (path.startsWith("/api/manager/room-blocks")) {
        if (req.method() === "DELETE")
          data.blocks = data.blocks.filter((b) => !path.endsWith(b.blockId));
        else if (req.method() === "PUT")
          data.blocks = data.blocks.map((b) =>
            path.endsWith(b.blockId) ? { ...b, ...body } : b,
          );
        else
          data.blocks.push({
            ...block,
            ...body,
            blockId: `${data.blocks.length + 1}${blockId.slice(1)}`,
          });
      }
      return route.fulfill({ status: 204 });
    }
    let json: unknown = [];
    if (path === "/api/users/me")
      json = {
        userId,
        fullName: "Center Manager",
        email: "manager@example.com",
        role: "CENTER_MANAGER",
        sportIds: [],
      };
    else if (path.includes("notifications"))
      json = {
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
        unreadCount: 0,
      };
    else if (path === "/api/rooms")
      json = [
        {
          roomId: 7,
          roomTypeId: 3,
          sportId: 1,
          name: "Court A",
          capacity: 12,
          isActive: true,
        },
      ];
    else if (path === "/api/room-types")
      json = [{ roomTypeId: 3, name: "Court", sportIds: [1], isActive: true }];
    else if (path.endsWith("/sports"))
      json = [
        {
          sportId: 1,
          code: "badminton",
          name: "Badminton",
          isActive: true,
          services: [{ serviceType: "COURT_RENTAL", isEnabled: true }],
        },
      ];
    else if (path === "/api/manager/court-rates") json = data.rates;
    else if (path === "/api/manager/room-blocks") json = data.blocks;
    else if (path === "/api/membership-packages")
      json = [
        {
          packageId: 71,
          name: "Gym 30 days",
          price: 300000,
          durationDays: 30,
          isActive: true,
          sessionLimit: null,
        },
      ];
    return route.fulfill({ json });
  });
  return { data, writes };
}

async function capture(page: Page, name: string) {
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.screenshot({
      path: `../.tmp/${name}-${device}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}

test("empty block times creates a block, then supports adding, editing and cancelling", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manager/facilities/7?tab=blocks");
  const section = page.getByRole("region", {
    name: "Blocked times",
    exact: true,
  });
  await expect(section.getByLabel("Start", { exact: true })).toBeVisible();
  await capture(page, "court-block-empty");
  await section.getByLabel("Start", { exact: true }).fill("2031-03-03T09:00");
  await section.getByLabel("End", { exact: true }).fill("2031-03-03T11:00");
  await section.getByLabel("Reason", { exact: true }).fill("Floor maintenance");
  await section
    .getByRole("button", { name: "Add block time", exact: true })
    .click();
  await expect(section.getByLabel("Start", { exact: true })).toHaveCount(0);
  await expect(
    section.getByText("Floor maintenance", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes[0]).toMatchObject({
    method: "POST",
    body: {
      startAtUtc: "2031-03-03T02:00:00.000Z",
      endAtUtc: "2031-03-03T04:00:00.000Z",
    },
  });
  await capture(page, "court-block-list");
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(section.getByLabel("Start", { exact: true })).toHaveValue(
    "2031-03-03T09:00",
  );
  await section.getByLabel("End", { exact: true }).fill("2031-03-03T08:00");
  await expect(
    section.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await section.getByLabel("End", { exact: true }).fill("2031-03-03T12:00");
  await section
    .getByLabel("Reason", { exact: true })
    .fill("Extended maintenance");
  await section
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    section.getByText("Extended maintenance", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes[1]).toMatchObject({
    method: "PUT",
    path: `/api/manager/room-blocks/${blockId}`,
    body: { endAtUtc: "2031-03-03T05:00:00.000Z" },
  });
  await section
    .getByRole("button", { name: "Add block time", exact: true })
    .click();
  await expect(section.getByLabel("Reason", { exact: true })).toHaveValue("");
  await section.getByRole("button", { name: "Cancel", exact: true }).click();
  await section.getByRole("button", { name: "Cancel", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Cancel block time",
    exact: true,
  });
  await expect(
    confirmation.getByText("Extended maintenance", { exact: true }),
  ).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(section.getByLabel("Start", { exact: true })).toBeVisible();
  expect(fixture.writes[2]).toMatchObject({
    method: "DELETE",
    path: `/api/manager/room-blocks/${blockId}`,
  });
});

test("a rejected block edit keeps the entered values and incident blocks use the incident flow", async ({
  page,
}) => {
  const fixture = await setup(page, [
    block,
    {
      ...block,
      blockId: userId,
      incidentId: userId,
      reason: "Incident closure",
    },
  ]);
  await page.goto("/manager/facilities/7?tab=blocks");
  const section = page.getByRole("region", {
    name: "Blocked times",
    exact: true,
  });
  const incident = section
    .getByRole("listitem")
    .filter({ hasText: "Incident closure" });
  await expect(
    incident.getByRole("link", { name: "Incidents", exact: true }),
  ).toHaveAttribute("href", `/manager/incidents?roomId=7&incidentId=${userId}`);
  await expect(incident.getByRole("button")).toHaveCount(0);
  await page.route(`**/api/manager/room-blocks/${blockId}`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "occupancy_conflict",
        message: "This court is occupied at the selected time.",
      },
    }),
  );
  await section.getByRole("button", { name: "Edit", exact: true }).click();
  await section
    .getByLabel("Reason", { exact: true })
    .fill("Revised maintenance");
  await section
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(section.getByRole("alert")).toContainText("occupied");
  await expect(section.getByLabel("Reason", { exact: true })).toHaveValue(
    "Revised maintenance",
  );
  expect(fixture.data.blocks[0].reason).toBe("Floor maintenance");
});

test("court list shows effective hourly prices and membership actions are directly visible", async ({
  page,
}) => {
  const fixture = await setup(page);
  fixture.data.rates = [
    rate,
    { ...rate, rateId: 2, roomId: 7, pricePerHour: 100000 },
    { ...rate, rateId: 3, roomId: 8, pricePerHour: 900000 },
    { ...rate, rateId: 4, roomId: 7, isActive: false, pricePerHour: 800000 },
  ];
  await page.goto("/manager/facilities");
  await expect(
    page.getByRole("columnheader", {
      name: "Price per hour (VND)",
      exact: true,
    }),
  ).toBeVisible();
  const court = page.getByRole("row").filter({ hasText: "Court A" });
  await expect(court).toContainText(/100[.,]000/);
  await expect(court).not.toContainText(/50[.,]000|900[.,]000|800[.,]000/);
  await capture(page, "court-hourly-prices");
  fixture.data.rates[1] = {
    ...fixture.data.rates[1],
    startTimeLocal: "18:00",
    pricePerHour: 200000,
  };
  await page.reload();
  await expect(court).toContainText(/50[.,]000/);
  await expect(court).toContainText(/200[.,]000/);
  await page.goto("/manager/membership-plans");
  const plan = page.getByRole("row").filter({ hasText: "Gym 30 days" });
  await expect(plan.locator("summary")).toHaveCount(0);
  await expect(
    plan.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeVisible();
  await capture(page, "membership-direct-actions");
});

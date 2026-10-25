import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";

const c = en.incidentRefunds;
const rows = [
  {
    sourceId: "11111111-1111-4111-8111-111111111111",
    sourceType: "GYM_DAY_PASS",
    memberId: "a",
    memberName: "Linh Nguyen",
    serviceName: "Gym day pass",
    status: "CheckInRecorded",
    isPaid: true,
    maximumRefundPoints: 50,
    refundedPoints: 0,
    suggestedRefundPoints: 50,
  },
  {
    sourceId: "22222222-2222-4222-8222-222222222222",
    sourceType: "COURT_RENTAL",
    memberId: "b",
    memberName: "Minh Tran",
    serviceName: "Badminton court A",
    status: "InUse",
    isPaid: true,
    maximumRefundPoints: 150,
    refundedPoints: 50,
    suggestedRefundPoints: 150,
  },
  {
    sourceId: "33333333-3333-4333-8333-333333333333",
    sourceType: "COURT_RENTAL",
    memberId: "c",
    memberName: "An Le",
    serviceName: "Basketball court B",
    status: "Cancelled",
    isPaid: true,
    maximumRefundPoints: 0,
    refundedPoints: 200,
    suggestedRefundPoints: 0,
  },
  {
    sourceId: "44444444-4444-4444-8444-444444444444",
    sourceType: "COURT_RENTAL",
    memberId: "d",
    memberName: "Thao Pham",
    serviceName: "Badminton court C",
    status: "PendingPayment",
    isPaid: false,
    maximumRefundPoints: 0,
    refundedPoints: 0,
    suggestedRefundPoints: 0,
  },
].map((row) => ({
  ...row,
  startAtUtc: "2026-10-25T01:00:00Z",
  endAtUtc: "2026-10-25T03:00:00Z",
}));

async function setup(page: Page) {
  const writes: Record<string, unknown>[] = [];
  let version = 1;
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "incident-refund-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          email: "manager@example.com",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/rooms")
      return route.fulfill({
        json: [
          {
            roomId: 1,
            roomTypeId: 1,
            name: "Gym floor",
            isActive: true,
            capacity: 30,
          },
        ],
      });
    if (path === "/api/manager/incidents/preview")
      return route.fulfill({
        json: {
          scope: "CENTER",
          roomId: null,
          startAtUtc: "2026-10-25T01:00:00Z",
          endAtUtc: "2026-10-25T04:00:00Z",
          canResolve: true,
          blockReason: null,
          impacts: [],
          members: [],
          refunds: rows,
          previewToken: "preview-" + version,
        },
      });
    if (path === "/api/manager/incidents/resolve") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({
        json: { incidentId: "55555555-5555-4555-8555-555555555555" },
      });
    }
    if (path === "/api/manager/incidents")
      return route.fulfill({
        json: { items: [], page: 1, pageSize: 20, totalCount: 0 },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto(
    "/manager/incidents?scope=CENTER&start=2026-10-25T08:00&end=2026-10-25T11:00&reason=Power%20failure%20across%20the%20center",
  );
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  return {
    writes,
    changed: () => {
      version++;
    },
  };
}

test("refund preview uses one editable points column, requires reasons and confirms exact amounts", async ({
  page,
}) => {
  const fixture = await setup(page);
  const dialog = page.getByRole("dialog", {
    name: en.operations.impact,
    exact: true,
  });
  const table = dialog.getByRole("region", { name: c.title, exact: true });
  await expect(
    table.getByRole("columnheader", { name: c.points, exact: true }),
  ).toHaveCount(1);
  await expect(table.getByRole("columnheader")).toHaveCount(5);
  await expect(table.getByRole("spinbutton").nth(0)).toHaveValue("50");
  await expect(table.getByRole("spinbutton").nth(1)).toHaveValue("150");
  await expect(table.getByRole("spinbutton").nth(2)).toBeDisabled();
  await expect(table.getByRole("spinbutton").nth(3)).toBeDisabled();
  await expect(table).toContainText(c.checkedIn);
  await expect(table).toContainText(c.fullyRefunded);
  await table.getByRole("spinbutton").nth(1).fill("151");
  await expect(
    dialog.getByRole("button", { name: c.review, exact: true }),
  ).toBeDisabled();
  await table.getByRole("spinbutton").nth(1).fill("75");
  await expect(
    dialog.getByRole("button", { name: c.review, exact: true }),
  ).toBeDisabled();
  await table
    .getByRole("textbox", { name: c.reason, exact: true })
    .fill("Member used the first part of the reservation");
  await expect(
    dialog.getByRole("button", { name: c.review, exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: c.review, exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: en.managerOperations.resolveReview,
    exact: true,
  });
  await expect(confirm.getByRole("spinbutton")).toHaveCount(0);
  await expect(confirm).toContainText("125");
  expect(fixture.writes).toHaveLength(0);
  await confirm.getByRole("button", { name: c.confirm, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({
    previewToken: "preview-1",
    refunds: [
      { sourceId: rows[0].sourceId, points: 50 },
      {
        sourceId: rows[1].sourceId,
        points: 75,
        adjustmentReason: "Member used the first part of the reservation",
      },
      { sourceId: rows[2].sourceId, points: 0 },
      { sourceId: rows[3].sourceId, points: 0 },
    ],
  });
  expect(fixture.writes[0].operationId).toMatch(/^[a-f0-9-]{36}$/);
});

test("changed preview requires another review before refund confirmation", async ({
  page,
}) => {
  const fixture = await setup(page);
  fixture.changed();
  await page.getByRole("button", { name: c.review, exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: c.changed }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", {
      name: en.managerOperations.resolveReview,
      exact: true,
    }),
  ).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

for (const width of [1440, 390])
  test(`refund list stays readable and accessible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    const dialog = page.getByRole("dialog", {
      name: en.operations.impact,
      exact: true,
    });
    const table = dialog.getByRole("region", { name: c.title, exact: true });
    await table.getByRole("spinbutton").nth(1).fill("75");
    await table
      .getByRole("textbox", { name: c.reason, exact: true })
      .fill("Part of the booking was already used");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`incident-refunds-${width}.png`),
      animations: "disabled",
    });
  });

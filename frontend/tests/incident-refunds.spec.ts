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

async function setup(
  page: Page,
  dayPassOnly = false,
  openReview = true,
  withBlock = false,
) {
  const writes: Record<string, unknown>[] = [];
  const discards: Record<string, unknown>[][] = [];
  const intermediateWrites: string[] = [];
  let cleanupFails = false;
  let version = 1;
  let expired = false;
  let actorId = "manager";
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "incident-refund-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      route.request().method() !== "GET" &&
      (path === "/api/manager/incidents/fences" ||
        path.startsWith("/api/manager/room-blocks/"))
    )
      intermediateWrites.push(path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: actorId,
          role: "CENTER_MANAGER",
          fullName: "Manager",
          email: "manager@example.com",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/manager/incidents/drafts/discard") {
      discards.push(route.request().postDataJSON());
      return route.fulfill(
        cleanupFails
          ? { status: 503, json: { error: "cleanup_failed" } }
          : { json: [] },
      );
    }
    if (path.endsWith("/notifications"))
      return route.fulfill({
        json: { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, read: 0 },
      });
    if (path === "/api/system-settings")
      return route.fulfill({
        json: [
          { key: "center.opening_minutes", value: "360" },
          { key: "center.closing_minutes", value: "1320" },
        ],
      });
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
          canResolve:
            !withBlock ||
            route
              .request()
              .postDataJSON()
              .resolutions?.some(
                (p: { action: string }) => p.action === "REMOVE_ROOM_BLOCK",
              ),
          blockReason: null,
          impacts: withBlock
            ? [
                {
                  sourceId: "77777777-7777-4777-8777-777777777777",
                  sourceType: "ROOM_BLOCK",
                  startAtUtc: "2026-10-25T01:00:00Z",
                  endAtUtc: "2026-10-25T02:00:00Z",
                  resolutionOptions: [{ action: "RemoveExistingBlock" }],
                },
              ]
            : [],
          members: dayPassOnly
            ? ["a", "b"].map((memberId, index) => ({
                memberId,
                memberName: ["Linh Nguyen", "Minh Tran"][index],
                sourceType: "GYM_DAY_PASS",
                sourceId: rows[index].sourceId,
                outcome: "DAY_PASS_SUPPORT",
                expectedRefundPoints: null,
              }))
            : [],
          closesGym: dayPassOnly,
          refunds: dayPassOnly ? [] : rows,
          previewToken:
            "preview-" +
            version +
            (withBlock
              ? ":" + (route.request().postDataJSON().resolutions?.length ?? 0)
              : ""),
        },
      });
    if (path === "/api/manager/incidents/fences")
      return route.fulfill({
        json: [
          {
            fenceId: "66666666-6666-4666-8666-666666666666",
            scope: "CENTER",
            roomId: null,
            startAtUtc: "2026-10-25T01:00:00Z",
            endAtUtc: "2026-10-25T04:00:00Z",
            reason: "Power failure across the center",
            isExpired: expired,
            expiresAtUtc: expired
              ? "2020-01-01T00:00:00Z"
              : "2099-10-25T05:00:00Z",
          },
        ],
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
  if (openReview)
    await page
      .getByRole("button", { name: en.operations.review, exact: true })
      .click();
  return {
    writes,
    intermediateWrites,
    discards,
    failCleanup: (value: boolean) => {
      cleanupFails = value;
    },
    changed: () => {
      version++;
    },
    expire: () => {
      expired = true;
    },
    changeUser: () => {
      actorId = "another-manager";
    },
  };
}

test("review and refresh never save a draft or create a hold before confirmation", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) =>
        k.startsWith("sporthub.incident-draft."),
      ),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("sporthub.incident-cleanup.v1:manager"),
    ),
  ).toBeNull();
  expect(fixture.intermediateWrites).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.discards).toHaveLength(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("sporthub.incident-cleanup.v1:manager"),
      ),
    )
    .toBeNull();
  expect(fixture.writes).toHaveLength(0);
  expect(page.url()).not.toContain("reason=");
});

test("refresh clears a form that was never reviewed without creating a server hold", async ({
  page,
}) => {
  const fixture = await setup(page, true, false);
  await page
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Unsaved form");
  await page.reload();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("");
  expect(fixture.discards).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
});

test("room-block changes are selected locally and submitted only with final incident confirmation", async ({
  page,
}) => {
  const fixture = await setup(page, true, true, true);
  const impact = page.getByRole("dialog", {
    name: en.operations.impact,
    exact: true,
  });
  await impact
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  const remove = page.getByRole("dialog", {
    name: en.operations.remove,
    exact: true,
  });
  await remove
    .getByRole("button", { name: en.incidentPlans.usePlan, exact: true })
    .click();
  await expect(
    impact.getByText(en.incidentPlans.selected, { exact: true }),
  ).toBeVisible();
  expect(fixture.intermediateWrites).toHaveLength(0);
  expect(fixture.writes).toHaveLength(0);
  await impact
    .getByRole("button", {
      name: en.incidentDayPassMembers.review,
      exact: true,
    })
    .click();
  const final = page.getByRole("dialog", {
    name: en.managerOperations.resolveReview,
    exact: true,
  });
  await expect(
    final.getByRole("region", { name: en.incidentPlans.title, exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await final
    .getByRole("button", {
      name: en.incidentDayPassMembers.confirm,
      exact: true,
    })
    .click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].resolutions).toMatchObject([
    {
      sourceId: "77777777-7777-4777-8777-777777777777",
      action: "REMOVE_ROOM_BLOCK",
    },
  ]);
  expect(fixture.intermediateWrites).toHaveLength(0);
});

test("refresh discards selected schedule changes without applying them", async ({
  page,
}) => {
  const fixture = await setup(page, true, true, true);
  await page
    .getByRole("dialog", { name: en.operations.impact, exact: true })
    .getByRole("button", { name: en.operations.remove, exact: true })
    .click();
  await page
    .getByRole("dialog", { name: en.operations.remove, exact: true })
    .getByRole("button", { name: en.incidentPlans.usePlan, exact: true })
    .click();
  await expect(
    page.getByText(en.incidentPlans.selected, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.intermediateWrites).toHaveLength(0);
  expect(fixture.discards).toHaveLength(0);
});

test("old saved drafts are purged and cleanup failure can be retried", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page.evaluate(() => {
    localStorage.setItem(
      "sporthub.incident-draft.v1:manager",
      JSON.stringify({
        scope: "CENTER",
        roomId: "",
        start: "2026-10-25T08:00",
        end: "2026-10-25T11:00",
        fenceId: "66666666-6666-4666-8666-666666666666",
      }),
    );
    localStorage.setItem(
      "sporthub.incident-draft.v1:old-account",
      "old personal draft",
    );
  });
  fixture.failCleanup(true);
  await page.reload();
  await expect(
    page.getByText(en.incidentDraft.cleanupError, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((k) =>
        k.startsWith("sporthub.incident-draft."),
      ),
    ),
  ).toBe(false);
  fixture.failCleanup(false);
  await page
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(en.incidentDraft.cleanupError, { exact: true }),
  ).toHaveCount(0);
});

test("successful confirmation shows a popup without a detail redirect and refresh does not repeat it", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page
    .getByRole("button", {
      name: en.incidentDayPassMembers.review,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: en.incidentDayPassMembers.confirm,
      exact: true,
    })
    .click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  await expect(
    page.getByRole("dialog", {
      name: en.incidentHistory.successTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/incidentId=/);
  await page.reload();
  await expect(page).not.toHaveURL(/incidentId=/);
  await expect(
    page.getByRole("button", { name: en.operations.review, exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.discards).toHaveLength(0);
});

test("Gym incident only lists affected day-pass holders with avatars and no points controls", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  const dialog = page.getByRole("dialog", {
    name: en.operations.impact,
    exact: true,
  });
  const members = dialog.getByRole("region", {
    name: en.incidentDayPassMembers.title,
    exact: true,
  });
  await expect(members).toContainText("Linh Nguyen");
  await expect(members).toContainText("Minh Tran");
  await expect(members.getByRole("listitem")).toHaveCount(2);
  await expect(
    members.getByRole("listitem").nth(0).locator("img"),
  ).toBeVisible();
  await expect(
    members.getByRole("listitem").nth(1).locator("img"),
  ).toBeVisible();
  await expect(members.getByRole("textbox")).toHaveCount(0);
  await expect(
    dialog.getByText("Total compensation points", { exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await members.scrollIntoViewIfNeeded();
    await members.screenshot({
      path: test.info().outputPath(`affected-day-pass-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await dialog
    .getByRole("button", {
      name: en.incidentDayPassMembers.review,
      exact: true,
    })
    .click();
  const confirm = page.getByRole("dialog", {
    name: en.managerOperations.resolveReview,
    exact: true,
  });
  await expect(
    confirm
      .getByRole("region", {
        name: en.incidentDayPassMembers.title,
        exact: true,
      })
      .getByRole("listitem"),
  ).toHaveCount(2);
  await expect(
    confirm.getByText("Total compensation points", { exact: true }),
  ).toHaveCount(0);
  await confirm
    .getByRole("button", {
      name: en.incidentDayPassMembers.confirm,
      exact: true,
    })
    .click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].dayPassGifts).toBeUndefined();
});

test("Gym incident can be confirmed without granting any points", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page
    .getByRole("dialog", { name: en.operations.impact, exact: true })
    .getByRole("button", {
      name: en.incidentDayPassMembers.review,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", {
      name: en.managerOperations.resolveReview,
      exact: true,
    })
    .getByRole("button", {
      name: en.incidentDayPassMembers.confirm,
      exact: true,
    })
    .click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].dayPassGifts).toBeUndefined();
  const success = page.getByRole("dialog", {
    name: en.incidentHistory.successTitle,
    exact: true,
  });
  await expect(success).toBeVisible();
  await success.screenshot({ path: "../.tmp/incident-created-success.png" });
  await success
    .getByRole("button", { name: en.common.close, exact: true })
    .last()
    .click();
  await expect(success).toHaveCount(0);
  await expect(page).toHaveURL(/\/manager\/incidents$/);
  await expect(
    page.getByLabel(en.operations.reason, { exact: true }),
  ).toHaveValue("");
  expect(fixture.writes).toHaveLength(1);
});

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

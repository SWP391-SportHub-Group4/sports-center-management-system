import { expect, test, type Page } from "@playwright/test";
import { en } from "../src/locales/en";

const copy = en.classWorkspace;
async function fixture(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "manager-fixture"),
  );
  let cancelled = false;
  let failed = false;
  let blockedReason: string | null = null;
  let gate: Promise<void> | null = null;
  const writes: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager-1",
          role: "CENTER_MANAGER",
          fullName: "Center Manager",
          email: "manager@example.test",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/manager/classes/22")
      return route.fulfill({
        json: {
          classId: 22,
          code: "BAD-22",
          name: "Badminton foundations",
          sportId: 3,
          sportName: "Badminton",
          coachId: "coach-1",
          coachName: "Coach Linh",
          defaultRoomId: 7,
          roomName: "Court A",
          startDate: "2030-10-25",
          numSessions: 8,
          capacity: 12,
          price: 300000,
          costAmount: 1800000,
          breakEvenThreshold: 6,
          thresholdStatus: "NOT_EVALUATED",
          thresholdDeadlineUtc: "2030-10-22T07:00:00Z",
          firstSessionStartUtc: "2030-10-25T07:00:00Z",
          status: cancelled ? "CANCELLED" : "PUBLISHED",
          confirmedCount: 4,
          reservedCount: 4,
          activeHoldCount: 0,
          availableSeats: 8,
          enrollmentOpen: !cancelled,
          version: 1,
          createdAt: "2030-10-01T00:00:00Z",
          publishedAt: "2030-10-02T00:00:00Z",
          scheduleRules: [],
        },
      });
    if (path.endsWith("/cancellation-preview")) {
      if (gate) await gate;
      if (failed)
        return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({
        json: {
          canCancel: !blockedReason,
          refundsImmediately: !blockedReason,
          blockedReason,
          previewToken: "latest-roster",
          confirmedCount: 4,
          activeHoldCount: 0,
          totalSessions: 8,
          sessionsNotProvided: 8,
          refundPoints: 1200,
        },
      });
    }
    if (path.endsWith("/cancel") && req.method() === "POST") {
      writes.push(req.postDataJSON());
      cancelled = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [] });
  });
  return {
    writes,
    fail: (value: boolean) => {
      failed = value;
    },
    block: (value: string) => {
      blockedReason = value;
    },
    hold: (value: Promise<void>) => {
      gate = value;
    },
  };
}

test("due unevaluated class offers cancellation and reviews refunds before writing", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/manager/classes/22?tab=management");
  const action = page.getByRole("region", { name: copy.belowThresholdTitle });
  await expect(action).toContainText("4 / 6");
  await expect(action).toContainText(copy.cancelBelowThresholdHint);
  await expect(
    page.getByText(copy.cancellationUnavailable, { exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await action.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.impeccable/review/class-cancellation-action-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await action.getByRole("button", { name: copy.cancelAndRefund }).click();
  const dialog = page.getByRole("dialog", {
    name: copy.cancelClass,
    exact: true,
  });
  const preview = dialog.getByRole("button", {
    name: en.operations.cancellationPreview,
  });
  await expect(preview).toBeDisabled();
  await dialog
    .getByLabel(en.operations.reason, { exact: true })
    .fill("Minimum enrollment was not reached");
  await preview.click();
  await expect(dialog).toContainText("1200");
  await expect(dialog).not.toContainText("Course interests");
  expect(f.writes).toHaveLength(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `../.impeccable/review/class-cancellation-review-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await dialog
    .getByRole("button", { name: en.operations.confirm, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(f.writes).toEqual([
    {
      reason: "Minimum enrollment was not reached",
      previewToken: "latest-roster",
    },
  ]);
  await expect(
    page.getByRole("button", { name: copy.cancelAndRefund }),
  ).toHaveCount(0);
});

test("cancellation stays closed while checking and recovers from a failed check", async ({
  page,
}) => {
  const f = await fixture(page);
  let release!: () => void;
  f.hold(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  f.fail(true);
  await page.goto("/manager/classes/22?tab=management");
  await expect(
    page.getByRole("region", { name: copy.checkingCancellation }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: copy.cancelAndRefund }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("region", { name: copy.cancellationCheckFailed }),
  ).toBeVisible();
  f.fail(false);
  await page
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: copy.cancelAndRefund }),
  ).toBeVisible();
  expect(f.writes).toHaveLength(0);
});

for (const [reason, message] of [
  ["before_review_deadline", copy.cancellationBeforeDeadline],
  ["session_completed", copy.cancellationTeachingCompleted],
  ["threshold_met", copy.cancellationThresholdMet],
  ["threshold_waived", copy.cancellationWaived],
] as const) {
  test(`server blocks cancellation for ${reason} and explains why`, async ({
    page,
  }) => {
    const f = await fixture(page);
    f.block(reason);
    await page.goto("/manager/classes/22?tab=management");
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.cancelAndRefund }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: copy.viewSchedule, exact: true }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(0);
  });
}

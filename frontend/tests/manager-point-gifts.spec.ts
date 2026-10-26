import { expect, test, type Page } from "@playwright/test";

const member = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const incident = "33333333-3333-4333-8333-333333333333";
const paged = (items: unknown[]) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 20,
});

async function fixture(page: Page, dayPass = false, failOnce = false) {
  const posts: {
    batchId: string;
    recipients: { memberId: string; points: number; memberAgreed: boolean }[];
    incidentId?: string;
  }[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "gift-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Manager",
          role: "CENTER_MANAGER",
          email: "manager@example.com",
          sportIds: [],
        },
      });
    if (path === "/api/manager/point-gifts/filters")
      return route.fulfill({ json: [{ packageId: 1, name: "Gym monthly" }] });
    if (path === "/api/manager/point-gifts/limits")
      return route.fulfill({
        json: {
          fromDate: "2026-10-01",
          toDate: "2026-10-26",
          netCollectedVnd: 25000,
          vndPerPoint: 1000,
          maxPoints: 25,
        },
      });
    if (path === "/api/manager/point-gifts/recipients")
      return route.fulfill({
        json: paged([
          {
            memberId: member,
            name: "Alex Nguyen",
            email: "alex@example.com",
            requiresAgreement: dayPass,
            alreadyGifted: false,
          },
          {
            memberId: other,
            name: "Linh Tran",
            email: "linh@example.com",
            requiresAgreement: false,
            alreadyGifted: dayPass,
          },
        ]),
      });
    if (
      path === "/api/manager/point-gifts" &&
      route.request().method() === "POST"
    ) {
      posts.push(route.request().postDataJSON());
      if (failOnce && posts.length === 1) return route.abort("failed");
      return route.fulfill({
        json: {
          batchId: posts.at(-1)!.batchId,
          recipients: posts.at(-1)!.recipients.length,
          totalPoints: 25,
        },
      });
    }
    if (path === "/api/manager/point-gifts" || path === "/api/users")
      return route.fulfill({ json: paged([]) });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/reports/revenue")
      return route.fulfill({
        json: {
          fromDate: url.searchParams.get("fromDate"),
          toDate: url.searchParams.get("toDate"),
          outstandingPoints: 0,
          pointsIssued: 0,
          pointsRefunded: 0,
          pointsRedeemed: 0,
          managerPointAdjustment: 0,
        },
      });
    if (path.includes("points-summary"))
      return route.fulfill({
        json: { outstandingPoints: 0, pointsSold: 0, pointsSpent: 0 },
      });
    return route.fulfill({ json: [] });
  });
  return posts;
}

for (const width of [1440, 390]) {
  test(`Manager reviews and gifts immediately at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const posts = await fixture(page);
    await page.goto("/manager/points");
    await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).check();
    await page
      .getByRole("textbox", { name: "Points for Alex Nguyen" })
      .fill("15");
    await page
      .getByRole("textbox", { name: "Points for Linh Tran" })
      .fill("10");
    await page.getByLabel("Gift reason (required)").fill("Member appreciation");
    expect(posts).toHaveLength(0);
    await page
      .getByRole("button", { name: "Review gift", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Review gift" }),
    ).not.toContainText("Total:");
    await page.screenshot({
      path: `../.tmp/gift-review-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirm gift", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Points added" }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].recipients.map((r) => r.points)).toEqual([15, 10]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
}

test("Gift form validates typed points immediately and reviews in a popup", async ({
  page,
}) => {
  const posts = await fixture(page);
  await page.goto("/manager/points");
  await expect(
    page.getByLabel("Membership status", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Affected period from", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Through date", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Name, email or member ID", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Name or email", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply to selected" }),
  ).toHaveCount(0);
  const table = page.getByRole("region", {
    name: "Member, Select",
    exact: true,
  });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Member",
    "Select",
  ]);
  await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
  await page.getByLabel("Gift reason (required)").fill("Member appreciation");
  const amount = page.getByRole("textbox", {
    name: "Common points amount",
    exact: true,
  });
  for (const invalid of ["-5", "1.5", "0", "2147483648"]) {
    await amount.fill(invalid);
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").first()).toHaveText(
      "Invalid points. Enter a positive whole number.",
    );
    await expect(
      page.getByRole("button", { name: "Review gift", exact: true }),
    ).toBeDisabled();
  }
  await amount.fill("25");
  await expect(
    page.getByRole("textbox", { name: "Points for Alex Nguyen" }),
  ).toHaveValue("25");
  await amount.hover();
  await page.mouse.wheel(0, -200);
  await expect(amount).toHaveValue("25");
  await page.getByRole("button", { name: "Review gift", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review gift" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Alex Nguyen");
  await expect(dialog).toContainText("25");
  await expect(dialog).toContainText("Member appreciation");
  expect(posts).toHaveLength(0);
  await dialog.getByRole("button", { name: "Back to edit" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(amount).toHaveValue("25");
});

test("Gift amount reports the live Net collected limit immediately", async ({
  page,
}) => {
  await fixture(page);
  let netCollectedVnd = 25000;
  await page.route("**/api/manager/point-gifts/limits", (route) =>
    route.fulfill({
      json: {
        fromDate: "2026-10-01",
        toDate: "2026-10-26",
        netCollectedVnd,
        vndPerPoint: 1000,
        maxPoints: Math.floor(netCollectedVnd / 1000),
      },
    }),
  );
  await page.goto("/manager/points");
  await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
  await page.getByLabel("Gift reason (required)").fill("Member appreciation");
  const amount = page.getByRole("textbox", {
    name: "Common points amount",
    exact: true,
  });
  await amount.fill("26");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").first()).toContainText(
    "Cannot exceed 25 points",
  );
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeDisabled();
  await amount.fill("25");
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeEnabled();
  netCollectedVnd = 10000;
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().endsWith("/api/manager/point-gifts/limits"),
    ),
    page.evaluate(() => window.dispatchEvent(new Event("focus"))),
  ]);
  await expect(page.getByRole("alert").first()).toContainText(
    "Cannot exceed 10 points",
  );
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeDisabled();
  await amount.fill("10");
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeEnabled();
  netCollectedVnd = 0;
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().endsWith("/api/manager/point-gifts/limits"),
    ),
    page.evaluate(() => window.dispatchEvent(new Event("focus"))),
  ]);
  await expect(page.getByRole("alert").first()).toContainText(
    "Cannot exceed 0 points",
  );
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeDisabled();
});

test("Day-pass agreement is required and retry reuses the same batch", async ({
  page,
}) => {
  const posts = await fixture(page, true, true);
  await page.goto(`/manager/points?incidentId=${incident}`);
  await expect(
    page.getByRole("checkbox", { name: "Select Linh Tran" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
  await page
    .getByLabel("Gift reason (required)")
    .fill("Day pass holder accepted points");
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Member agreed to receive points" })
    .check();
  await page.getByRole("button", { name: "Review gift", exact: true }).click();
  await page.getByRole("button", { name: "Confirm gift", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry gift" })).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Retry gift" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Points added" }),
  ).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0].incidentId).toBe(incident);
  expect(posts[0].recipients[0].memberAgreed).toBe(true);
});

test("Incident shows unchanged day passes and sends a notice separately from gifts", async ({
  page,
}) => {
  await fixture(page);
  let notified = false;
  await page.route(`**/api/manager/incidents/${incident}*`, async (route) =>
    route.fulfill({
      json: {
        incidentId: incident,
        scope: "CENTER",
        roomId: null,
        reason: "Gym repairs",
        resolutionSummary: "Gym temporarily closed.",
        startAtUtc: "2026-10-26T01:00:00Z",
        endAtUtc: "2026-10-26T05:00:00Z",
        createdAtUtc: "2026-10-26T00:00:00Z",
        closesGym: true,
        dayPassNoticeSentAtUtc: notified ? "2026-10-26T01:00:00Z" : null,
        dayPassMembers: [
          {
            passId: member,
            memberId: member,
            memberName: "Alex Nguyen",
            useDate: "2026-10-26",
            expiresAtUtc: "2026-10-26T15:00:00Z",
          },
        ],
        refunds: [],
      },
    }),
  );
  await page.route(
    `**/api/manager/incidents/${incident}/day-pass-notice`,
    async (route) => {
      notified = true;
      return route.fulfill({ status: 204 });
    },
  );
  await page.goto(`/manager/incidents/${incident}`);
  await expect(
    page.getByRole("heading", { name: "Day-pass support" }),
  ).toBeVisible();
  await expect(page.getByText("Alex Nguyen")).toBeVisible();
  await expect(
    page.getByText(/Passes keep their original 22:00 expiry/),
  ).toBeVisible();
  await page.screenshot({
    path: "../.tmp/day-pass-support-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.tmp/day-pass-support-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Notify day-pass holders" }).click();
  await expect(page.getByRole("status")).toContainText("Notice sent at");
  await expect(
    page.getByRole("button", { name: "Notify day-pass holders" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Gift points / View gift history" }),
  ).toHaveAttribute("href", `/manager/points?incidentId=${incident}`);
});

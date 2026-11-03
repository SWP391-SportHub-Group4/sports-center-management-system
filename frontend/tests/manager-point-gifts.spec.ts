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
      return route.fulfill({
        json: {
          sports: [
            { sportId: 1, name: "Gym" },
            { sportId: 2, name: "Badminton" },
            { sportId: 3, name: "Basketball" },
          ],
          classes: [
            {
              classId: 10,
              sportId: 2,
              name: "Cầu lông cơ bản",
              code: "BAD-01",
            },
            {
              classId: 20,
              sportId: 3,
              name: "Basketball beginners",
              code: "BAS-01",
            },
          ],
        },
      });
    if (path === "/api/manager/point-gifts/limits")
      return route.fulfill({
        json: {
          fromDate: "2026-10-01",
          toDate: "2026-10-26",
          vndPerPoint: 1000,
          maxPoints: 10000,
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
  test(`Gift selections survive searches and filters at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const posts = await fixture(page);
    const requests: URL[] = [];
    const alex = {
      memberId: member,
      name: "Alex Nguyen",
      email: "alex@example.com",
      requiresAgreement: false,
      alreadyGifted: false,
    };
    const linh = {
      ...alex,
      memberId: other,
      name: "Linh Tran",
      email: "linh@example.com",
    };
    await page.route("**/api/manager/point-gifts/recipients?**", (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const filtered =
        url.searchParams.get("keyword") ||
        url.searchParams.get("sportId") ||
        url.searchParams.get("unregistered");
      return route.fulfill({ json: paged(filtered ? [linh] : [alex, linh]) });
    });
    await page.goto("/manager/points");
    await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
    await page.getByLabel("Name or email", { exact: true }).fill("Linh");
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Nguyen" }),
    ).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).check();
    await page.getByLabel("Sport", { exact: true }).selectOption("2");
    await expect(
      page.getByRole("heading", { name: "Selected recipients (2)" }),
    ).toBeVisible();
    await page
      .getByLabel("Sport", { exact: true })
      .selectOption("unregistered");
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("unregistered"))
      .toBe("true");
    expect(requests.at(-1)?.searchParams.has("sportId")).toBe(false);
    await expect(
      page.getByRole("button", { name: "Class", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Select Linh Tran" }),
    ).toBeChecked();
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).uncheck();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (1)" }),
    ).toBeVisible();
    const toggle = page.getByRole("switch", { name: /Select all recipients/ });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (2)" }),
    ).toBeVisible();
    await page.getByLabel("Name or email", { exact: true }).fill("linh@");
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("keyword"))
      .toBe("linh@");
    await expect(toggle).toBeChecked();
    await page.getByLabel("Sport", { exact: true }).selectOption("2");
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("sportId"))
      .toBe("2");
    await expect(toggle).toBeChecked();
    await page
      .getByLabel("Name or email", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Class", exact: true }).click();
    await page.getByRole("button", { name: "Cầu lông cơ bản BAD-01" }).click();
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("classId"))
      .toBe("10");
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (2)" }),
    ).toBeVisible();
    await toggle.uncheck();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (1)" }),
    ).toBeVisible();
    await page.getByLabel("Name or email", { exact: true }).fill("");
    await page.getByLabel("Sport", { exact: true }).selectOption("");
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Nguyen" }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Select Linh Tran" }),
    ).not.toBeChecked();
    await page
      .getByRole("textbox", { name: "Common points amount", exact: true })
      .fill("10");
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).check();
    await page.getByLabel("Gift reason (required)").fill("Welcome all members");
    await expect(
      page
        .getByRole("region", { name: "Selected recipients", exact: true })
        .getByRole("table"),
    ).toHaveCount(0);
    await page.getByLabel("Sport", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../.tmp/gift-selection-${width}.png` });
    await page
      .getByRole("button", { name: "Review gift", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Alex Nguyen");
    await expect(page.getByRole("dialog")).toContainText("Linh Tran");
    await page
      .getByRole("button", { name: "Confirm gift", exact: true })
      .click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].recipients.map((r) => r.memberId)).toEqual([member, other]);
    expect(posts[0].recipients.map((r) => r.points)).toEqual([10, 10]);
  });
  test(`Gift filters search classes and select all pages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const requested: URL[] = [];
    await page.route("**/api/manager/point-gifts/recipients?**", (route) => {
      const url = new URL(route.request().url());
      requested.push(url);
      const pageSize = Number(url.searchParams.get("pageSize"));
      const pageNumber = Number(url.searchParams.get("page"));
      const start = (pageNumber - 1) * pageSize;
      return route.fulfill({
        json: {
          page: pageNumber,
          pageSize,
          totalCount: 102,
          items: Array.from(
            { length: Math.min(pageSize, 102 - start) },
            (_, i) => ({
              memberId: `member-${start + i}`,
              name: `Member ${start + i}`,
              email: `member${start + i}@example.com`,
              requiresAgreement: false,
              alreadyGifted: start + i === 101,
            }),
          ),
        },
      });
    });
    await page.goto("/manager/points");
    const course = page.getByRole("button", { name: "Class", exact: true });
    await course.click();
    await expect(
      page.getByRole("button", { name: "Basketball beginners BAS-01" }),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search classes" })
      .fill("cau long");
    await expect(
      page.getByRole("button", { name: "Cầu lông cơ bản BAD-01" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Basketball beginners BAS-01" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Cầu lông cơ bản BAD-01" }).click();
    await expect
      .poll(() => requested.at(-1)?.searchParams.get("classId"))
      .toBe("10");
    await page.getByLabel("Sport", { exact: true }).selectOption("3");
    await expect
      .poll(() => requested.at(-1)?.searchParams.has("classId"))
      .toBe(false);
    await course.click();
    await expect(
      page.getByRole("button", { name: "Cầu lông cơ bản BAD-01" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Basketball beginners BAS-01" }),
    ).toBeVisible();
    await page.screenshot({
      path: `../.tmp/gift-filters-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    const toggle = page.getByRole("switch", { name: /Select all recipients/ });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (101)" }),
    ).toBeVisible();
    expect(
      requested.some(
        (url) =>
          url.searchParams.get("page") === "2" &&
          url.searchParams.get("pageSize") === "100",
      ),
    ).toBeTruthy();
    await page
      .getByLabel("Gift reason (required)")
      .fill("All matching paying members");
    await expect(
      page.getByRole("button", { name: "Review gift", exact: true }),
    ).toBeEnabled();
    await toggle.uncheck();
    await expect(
      page.getByRole("heading", { name: "Selected recipients (0)" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
  test(`Manager reviews and gifts immediately at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const posts = await fixture(page);
    await page.goto("/manager/points");
    await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).check();
    await page
      .getByRole("textbox", { name: "Common points amount", exact: true })
      .fill("15");
    await expect(
      page
        .getByRole("region", { name: "Selected recipients", exact: true })
        .getByRole("table"),
    ).toHaveCount(0);
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
    expect(posts[0].recipients.map((r) => r.points)).toEqual([15, 15]);
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
  ).toHaveCount(0);
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

test("Gift amount enforces the fixed 10000 point limit", async ({ page }) => {
  await fixture(page);
  await page.goto("/manager/points");
  await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
  await page.getByLabel("Gift reason (required)").fill("Member appreciation");
  const amount = page.getByRole("textbox", {
    name: "Common points amount",
    exact: true,
  });
  await amount.fill("10001");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").first()).toContainText(
    "Cannot exceed 10,000 points",
  );
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeDisabled();
  await amount.fill("10000");
  await expect(
    page.getByRole("button", { name: "Review gift", exact: true }),
  ).toBeEnabled();
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
    .getByRole("checkbox", { name: /Member agreed to receive points/ })
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

test("incident details list affected day-pass members without support actions", async ({
  page,
}) => {
  await fixture(page);
  await page.route(`**/api/manager/incidents/${incident}`, (route) =>
    route.fulfill({
      json: {
        incidentId: incident,
        scope: "CENTER",
        reason: "Gym repairs",
        resolutionSummary: "Gym temporarily closed.",
        startAtUtc: "2026-10-26T01:00:00Z",
        endAtUtc: "2026-10-26T05:00:00Z",
        createdAtUtc: "2026-10-26T00:00:00Z",
        closesGym: true,
        dayPassNoticeSentAtUtc: "2026-10-26T01:00:00Z",
        dayPassMembers: [
          {
            passId: member,
            memberId: member,
            memberName: "Alex Nguyen",
            useDate: "2026-10-26",
            expiresAtUtc: "2026-10-26T13:30:00Z",
          },
        ],
        refunds: [],
      },
    }),
  );
  const response = await page.goto(`/manager/incidents/${incident}`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Gym repairs", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Nguyen", { exact: true })).toBeVisible();
  const affected = page.getByRole("region", {
    name: "Affected Gym day-pass members",
    exact: true,
  });
  await expect(affected.getByRole("listitem")).toHaveCount(1);
  await expect(affected.getByRole("link")).toHaveCount(0);
  await expect(affected.getByRole("status")).toHaveCount(0);
  await expect(affected.getByText(/Record the member/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Notify day-pass holders" }),
  ).toHaveCount(0);
});

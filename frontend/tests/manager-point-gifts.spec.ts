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
            availablePoints: 250,
            requiresAgreement: dayPass,
            alreadyGifted: false,
          },
          {
            memberId: other,
            name: "Linh Tran",
            email: "linh@example.com",
            availablePoints: 125,
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
  test(`Gift history opens in a popup and preserves the draft at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const requests: URL[] = [];
    let empty = false;
    await page.route("**/api/manager/point-gifts?**", (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const currentPage = Number(url.searchParams.get("page"));
      const filtered = url.searchParams.has("member");
      return route.fulfill({
        json: {
          page: currentPage,
          pageSize: 10,
          totalCount: empty ? 0 : filtered ? 1 : 11,
          items: empty
            ? []
            : Array.from(
                { length: filtered ? 1 : currentPage === 1 ? 10 : 1 },
                (_, index) => ({
                  giftId: `gift-${currentPage}-${index}`,
                  memberName: `Gift member ${filtered ? 11 : (currentPage - 1) * 10 + index + 1}`,
                  email: "gift@example.com",
                  points: 10,
                  reason: "Member appreciation",
                  managerName: "Center Manager",
                  createdAtUtc: "2026-11-03T01:00:00Z",
                }),
              ),
        },
      });
    });
    await page.goto(`/manager/points?incidentId=${incident}`);
    const historyButton = page.getByRole("button", {
      name: "Gift history",
      exact: true,
    });
    const history = page.getByRole("dialog", {
      name: "Gift history",
      exact: true,
    });
    await expect(historyButton).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Gift history", exact: true }),
    ).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
    await page
      .getByRole("button", { name: "Gift points (1)", exact: true })
      .click();
    await page.getByLabel("Gift reason (required)").fill("Keep this draft");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await historyButton.click();
    await expect(history).toBeVisible();
    await expect(
      history.getByRole("button", { name: "Apply", exact: true }),
    ).toHaveCount(0);
    await expect(
      history.getByRole("button", { name: "Clear", exact: true }),
    ).toHaveCount(0);
    await expect(history.getByRole("table")).toBeVisible();
    await expect(history.getByRole("table")).toContainText("Gift member 1");
    expect(requests[0].searchParams.get("incidentId")).toBe(incident);
    expect(requests[0].searchParams.get("pageSize")).toBe("10");
    await expect(history.locator("tbody tr")).toHaveCount(10);
    await expect(history.locator(".dialog__body")).toHaveCSS(
      "scrollbar-width",
      "none",
    );
    await expect(history.locator(".table-wrap")).toHaveCSS(
      "scrollbar-width",
      "none",
    );
    await page.screenshot({
      path: testInfo.outputPath(`gift-history-${width}.png`),
      fullPage: true,
    });
    await history
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(history.getByRole("table")).toContainText("Gift member 11");
    await expect(history.locator("tbody tr")).toHaveCount(1);
    await history.getByLabel("Member", { exact: true }).fill("Gift member 11");
    await history.getByLabel("Manager", { exact: true }).fill("Center Manager");
    await history.getByLabel("From", { exact: true }).fill("2026-11-03");
    await history.getByLabel("To", { exact: true }).fill("2026-11-03");
    await expect
      .poll(() => Object.fromEntries(requests.at(-1)?.searchParams ?? []))
      .toMatchObject({
        member: "Gift member 11",
        manager: "Center Manager",
        fromDate: "2026-11-03",
        toDate: "2026-11-03",
        page: "1",
      });
    expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
    expect(requests.at(-1)?.searchParams.get("manager")).toBe("Center Manager");
    expect(requests.at(-1)?.searchParams.get("fromDate")).toBe("2026-11-03");
    expect(requests.at(-1)?.searchParams.get("toDate")).toBe("2026-11-03");
    await expect(
      history.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    const filteredRequestCount = requests.length;
    await history.getByLabel("From", { exact: true }).fill("2026-11-04");
    await expect(history.getByRole("alert")).toHaveText(
      "To must be on or after From.",
    );
    expect(requests).toHaveLength(filteredRequestCount);
    await history.getByLabel("Member", { exact: true }).fill("");
    await history.getByLabel("Manager", { exact: true }).fill("");
    await history.getByLabel("From", { exact: true }).fill("");
    await history.getByLabel("To", { exact: true }).fill("");
    await expect(history.getByLabel("Member", { exact: true })).toHaveValue("");
    await expect(history.getByLabel("From", { exact: true })).toHaveValue("");
    await expect(history.locator("tbody tr")).toHaveCount(10);
    expect(requests.at(-1)?.searchParams.has("member")).toBe(false);
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await page
      .getByRole("button", { name: "Gift points (1)", exact: true })
      .click();
    await expect(page.getByLabel("Gift reason (required)")).toHaveValue(
      "Keep this draft",
    );
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Nguyen" }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    empty = true;
    await historyButton.click();
    await expect(history.getByText("No points gifts yet.")).toBeVisible();
    expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
    await history.getByRole("button", { name: "Close", exact: true }).click();
    await expect(history).toHaveCount(0);
  });

  test(`Merged recipients, wallet management and immediate gift at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const posts = await fixture(page);
    const walletRequests: string[] = [];
    await page.route("**/api/manager/wallets/**", (route) => {
      walletRequests.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        json: route.request().url().includes("/ledger")
          ? []
          : { availablePoints: 125, heldPoints: 5, vndPerPoint: 1000 },
      });
    });
    await page.goto("/manager/points");
    await expect(
      page.getByRole("heading", { name: "Points", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("From", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("To", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Previous page|Next page/ }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Gift reason (required)")).toHaveCount(0);
    const table = page.getByRole("region", {
      name: "Select all recipients, Member, Available points, Actions",
      exact: true,
    });
    await expect(table.locator("th")).toHaveText([
      "",
      "Member",
      "Available points",
      "Actions",
    ]);
    await table
      .getByRole("button", { name: "Wallet management" })
      .first()
      .click();
    const wallet = page.getByRole("dialog");
    await expect(wallet).toContainText("Alex Nguyen");
    await expect(wallet).toContainText("125");
    expect(walletRequests).toContain("/api/manager/wallets/" + member);
    await wallet.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).check();
    await page.screenshot({
      path: testInfo.outputPath("merged-recipients.png"),
      animations: "disabled",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Gift points (2)", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Gift points",
      exact: true,
    });
    await expect(dialog.locator("tbody tr")).toHaveCount(2);
    await expect(dialog).toContainText("Alex Nguyen");
    await expect(dialog).toContainText("Linh Tran");
    await dialog.getByLabel("Common points amount", { exact: true }).fill("15");
    await dialog
      .getByLabel("Gift reason (required)")
      .fill("Member appreciation");
    await expect(dialog.getByRole("table")).toContainText("15");
    expect(posts).toHaveLength(0);
    await page.screenshot({
      path: testInfo.outputPath("gift-composer.png"),
      animations: "disabled",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog
      .getByRole("button", { name: "Confirm gift", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Points added" }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].recipients.map((r) => r.points)).toEqual([15, 15]);
    await expect(
      page.getByRole("button", { name: "Gift points (0)", exact: true }),
    ).toBeDisabled();
  });

  test(`Selections and select-all survive filters at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const requests: URL[] = [];
    await page.route("**/api/manager/point-gifts/recipients?**", (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const filtered = url.searchParams.get("keyword");
      return route.fulfill({
        json: paged([
          ...(!filtered
            ? [
                {
                  memberId: member,
                  name: "Alex Nguyen",
                  email: "alex@example.com",
                  availablePoints: 125,
                  requiresAgreement: false,
                  alreadyGifted: false,
                },
              ]
            : []),
          {
            memberId: other,
            name: "Linh Tran",
            email: "linh@example.com",
            availablePoints: 125,
            requiresAgreement: false,
            alreadyGifted: false,
          },
        ]),
      });
    });
    await page.goto("/manager/points");
    const toggle = page.getByRole("checkbox", {
      name: "Select all recipients",
      exact: true,
    });
    await expect(
      page.locator("thead th").filter({ hasText: "Available points" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Clear selection", exact: true }),
    ).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.getByLabel("Name or email", { exact: true }).fill("Linh");
    await expect(
      page.getByRole("checkbox", { name: "Select Alex Nguyen" }),
    ).toHaveCount(0);
    await page.getByLabel("Sport", { exact: true }).selectOption("2");
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("sportId"))
      .toBe("2");
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Gift points (2)", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Class", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Search classes" })
      .fill("cau long");
    await page.getByRole("button", { name: "Cầu lông cơ bản BAD-01" }).click();
    await expect
      .poll(() => requests.at(-1)?.searchParams.get("classId"))
      .toBe("10");
    await expect(toggle).toBeChecked();
    await page
      .getByRole("button", { name: "Gift points (2)", exact: true })
      .click();
    await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(2);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("checkbox", { name: "Select Linh Tran" }).uncheck();
    await expect(toggle).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Gift points (1)", exact: true }),
    ).toBeEnabled();
  });
}

test("Scrolling recipient list loads every server page without navigation buttons", async ({
  page,
}) => {
  await fixture(page);
  const requested: number[] = [];
  await page.route("**/api/manager/point-gifts/recipients?**", (route) => {
    const url = new URL(route.request().url());
    const currentPage = Number(url.searchParams.get("page"));
    const size = Number(url.searchParams.get("pageSize"));
    requested.push(currentPage);
    const start = (currentPage - 1) * size;
    return route.fulfill({
      json: {
        page: currentPage,
        pageSize: size,
        totalCount: 102,
        items: Array.from(
          { length: Math.max(0, Math.min(size, 102 - start)) },
          (_, i) => ({
            memberId: `member-${start + i}`,
            name: `Member ${start + i}`,
            email: `member${start + i}@example.com`,
            availablePoints: 125,
            requiresAgreement: false,
            alreadyGifted: start + i === 101,
          }),
        ),
      },
    });
  });
  await page.goto("/manager/points");
  await expect(
    page.getByRole("checkbox", { name: "Select Member 101", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("checkbox")).toHaveCount(103);
  expect(requested).toContain(2);
  await expect(
    page.getByRole("button", { name: /Previous page|Next page/ }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Select all recipients", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Gift points (101)", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(101);
});

test("Gift dialog validates points and preserves its draft when closed", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/manager/points");
  await page.getByRole("checkbox", { name: "Select Alex Nguyen" }).check();
  const open = page.getByRole("button", {
    name: "Gift points (1)",
    exact: true,
  });
  await open.click();
  await page.getByLabel("Gift reason (required)").fill("Member appreciation");
  const amount = page.getByLabel("Common points amount", { exact: true });
  const confirm = page.getByRole("button", {
    name: "Confirm gift",
    exact: true,
  });
  for (const invalid of ["-5", "1.5", "0", "2147483648", "10001"]) {
    await amount.fill(invalid);
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(confirm).toBeDisabled();
  }
  await amount.fill("10000");
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await open.click();
  await expect(amount).toHaveValue("10000");
  await expect(page.getByLabel("Gift reason (required)")).toHaveValue(
    "Member appreciation",
  );
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
    .getByRole("button", { name: "Gift points (1)", exact: true })
    .click();
  await page
    .getByLabel("Gift reason (required)")
    .fill("Day pass holder accepted points");
  await expect(
    page.getByRole("button", { name: "Confirm gift", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Member agreed to receive points/ })
    .check();
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

test("Recipient points fall back to wallet balances when the running API omits them", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/manager/point-gifts/recipients?**", (route) =>
    route.fulfill({
      json: paged([
        {
          memberId: member,
          name: "Alex Nguyen",
          email: "alex@example.com",
          requiresAgreement: false,
          alreadyGifted: false,
        },
        {
          memberId: other,
          name: "Linh Tran",
          email: "linh@example.com",
          availablePoints: 0,
          requiresAgreement: false,
          alreadyGifted: false,
        },
      ]),
    }),
  );
  const walletRequests: string[] = [];
  await page.route("**/api/manager/wallets/**", (route) => {
    walletRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      json: { availablePoints: 375, heldPoints: 0, vndPerPoint: 1000 },
    });
  });
  await page.goto("/manager/points");
  const alex = page.locator("tbody tr").filter({ hasText: "Alex Nguyen" });
  const linh = page.locator("tbody tr").filter({ hasText: "Linh Tran" });
  await expect(alex.locator("td").nth(2)).toHaveText("375");
  await expect(linh.locator("td").nth(2)).toHaveText("0");
  expect(walletRequests).toEqual(["/api/manager/wallets/" + member]);
});

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";

const id = "55555555-5555-4555-8555-555555555555";
const secondId = "66666666-6666-4666-8666-666666666666";
const l = en.manualNotices;

async function fixture(page: Page) {
  const state = {
    delivered: false,
    legacy: false,
    denied: false,
    listError: false,
  };
  const queries: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const summary = {
    noticeId: id,
    subject: "Schedule update",
    senderName: "Manager Alex",
    createdAtUtc: "2026-10-18T03:00:00Z",
    recipientCount: 21,
    sendInApp: true,
    sendEmail: true,
    isLegacy: false,
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "manager-1",
        fullName: "Manager Alex",
        role: "CENTER_MANAGER",
        email: "manager@example.com",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/manager/notices") {
      queries.push(url);
      if (state.listError)
        return route.fulfill({
          status: 500,
          json: {
            error: "history_unavailable",
            message: "History is temporarily unavailable.",
          },
        });
      const empty = url.searchParams.get("search") === "nothing";
      const next = url.searchParams.get("page") === "2";
      return json({
        page: next ? 2 : 1,
        pageSize: 20,
        totalCount: empty ? 0 : 21,
        items: empty
          ? []
          : [
              {
                ...summary,
                ...(next
                  ? { noticeId: secondId, subject: "Older schedule update" }
                  : {}),
              },
            ],
      });
    }
    if (path.startsWith(`/api/manager/notices/${id}`) && state.denied)
      return route.fulfill({
        status: 404,
        json: { error: "notice_not_found", message: "Notice not found." },
      });
    if (path === `/api/manager/notices/${id}`)
      return json({
        ...summary,
        isLegacy: state.legacy,
        message: state.legacy
          ? null
          : "Please read this.\n<img src=x onerror=alert(1)>",
        sendInApp: !state.legacy,
        delivery: {
          total: 42,
          pending: 40,
          sending: 0,
          sent: state.delivered ? 1 : 0,
          failed: state.delivered ? 0 : 1,
          read: 1,
        },
      });
    if (path === `/api/manager/notices/${id}/recipients`) {
      const next = url.searchParams.get("page") === "2";
      return json({
        page: next ? 2 : 1,
        pageSize: 20,
        totalCount: 21,
        items: [
          {
            userId: next ? "recipient-2" : "recipient-1",
            name: next ? "Bob" : "Alice",
            email: next ? "bob@example.com" : "alice@example.com",
            inApp: state.legacy
              ? null
              : {
                  status: "READ",
                  retryCount: 0,
                  sentAt: "2026-10-18T03:00:00Z",
                  lastAttemptAt: null,
                },
            emailDelivery: {
              status: state.delivered ? "SENT" : "FAILED",
              retryCount: 2,
              sentAt: null,
              lastAttemptAt: "2026-10-18T03:00:00Z",
            },
          },
        ],
      });
    }
    if (path === "/api/users" || path === "/api/classes")
      return json({ items: [], totalCount: 0 });
    return json([]);
  });
  return { state, queries };
}

test("sent history filters and pages results and opens a notice without an ID lookup", async ({
  page,
}, testInfo) => {
  const { queries } = await fixture(page);
  await page.goto("/manager/notices?view=history");
  const table = page.getByRole("table", { name: l.history, exact: true });
  await expect(table.getByText("Schedule update")).toBeVisible();
  await page
    .getByRole("button", { name: en.common.nextPage, exact: true })
    .click();
  await expect(table.getByText("Older schedule update")).toBeVisible();
  await page.getByLabel(l.search, { exact: true }).fill("Schedule");
  await page.getByLabel(l.from, { exact: true }).fill("2026-10-18");
  await page.getByLabel(l.to, { exact: true }).fill("2026-10-18");
  await page.getByRole("button", { name: l.apply, exact: true }).click();
  await expect(table.getByText("Schedule update")).toBeVisible();
  expect(queries.at(-1)?.searchParams.get("page")).toBe("1");
  expect(queries.at(-1)?.searchParams.get("fromDate")).toBe("2026-10-18");
  expect(queries.at(-1)?.searchParams.get("search")).toBe("Schedule");
  await page.screenshot({
    path: testInfo.outputPath("history-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel(l.search, { exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: testInfo.outputPath("history-mobile.png"),
    fullPage: true,
  });
  await table
    .getByRole("link", { name: "Schedule update", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/manager/notices/${id}$`));
  await expect(
    page.getByText("alice@example.com", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: en.managerOperations.backToList, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: l.history, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("notice details show separate channel states, refresh them, and fit mobile", async ({
  page,
}, testInfo) => {
  const { state } = await fixture(page);
  await page.goto(`/manager/notices/${id}`);
  await expect(
    page.getByText("Please read this.\n<img src=x onerror=alert(1)>", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  const alice = page.getByRole("row").filter({ hasText: "alice@example.com" });
  await expect(
    alice.getByText(en.wireStatus.READ, { exact: true }),
  ).toBeVisible();
  await expect(
    alice.getByText(en.wireStatus.FAILED, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(l.channelCountHint)).toBeVisible();
  state.delivered = true;
  await page
    .getByRole("button", { name: en.operations.refresh, exact: true })
    .click();
  await expect(
    alice.getByText(en.wireStatus.SENT, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.common.nextPage, exact: true })
    .click();
  await expect(
    page.getByText("bob@example.com", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("notice-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: testInfo.outputPath("notice-mobile.png"),
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
});

test("older email-only notices explain missing content and do not invent an in-app delivery", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.legacy = true;
  await page.goto(`/manager/notices/${id}`);
  await expect(page.getByText(l.contentUnavailable)).toBeVisible();
  await expect(page.getByText(l.legacyHint)).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "alice@example.com" })
      .getByText(l.notSelected),
  ).toBeVisible();
});

test("history can retry a failed load and displays an empty filtered result", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.listError = true;
  await page.goto("/manager/notices?view=history");
  await expect(
    page.getByText("History is temporarily unavailable."),
  ).toBeVisible();
  state.listError = false;
  await page
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: l.history, exact: true }),
  ).toBeVisible();
  await page.getByLabel(l.search, { exact: true }).fill("nothing");
  await page.getByRole("button", { name: l.apply, exact: true }).click();
  await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
});

test("an inaccessible notice does not display recipient or content details", async ({
  page,
}) => {
  const { state } = await fixture(page);
  state.denied = true;
  await page.goto(`/manager/notices/${id}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Notice not found." }),
  ).toBeVisible();
  await expect(
    page.getByText("alice@example.com", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Schedule update", exact: true }),
  ).toHaveCount(0);
});

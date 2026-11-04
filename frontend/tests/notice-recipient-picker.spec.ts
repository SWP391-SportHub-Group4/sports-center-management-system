import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { en } from "../src/locales/en";

const roles = ["Admin", "Manager", "Receptionist", "Coach", "Member"];
const keys = [
  "SYSTEM_ADMINISTRATOR",
  "CENTER_MANAGER",
  "RECEPTIONIST",
  "COACH",
  "MEMBER",
];
const l = en.manualNotices;

async function fixture(page: Page) {
  const state = {
    queries: [] as URL[],
    failed: false,
    sent: null as Record<string, unknown> | null,
    sentKeys: [] as string[],
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "recipient-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: "manager-1",
        role: "CENTER_MANAGER",
        fullName: "Alex Manager",
        email: "manager@example.test",
        sportIds: [],
      });
    if (path.endsWith("unread-count")) return json({ count: 0 });
    if (path === "/api/manager/notices/recipient-filters")
      return json({
        classes: [
          { classId: 1, code: "BAD-01", name: "Badminton beginner" },
          { classId: 2, code: "BASK-02", name: "Basketball evening" },
        ],
        specialties: [
          { sportId: 1, name: "Badminton" },
          { sportId: 2, name: "Basketball" },
        ],
      });
    if (path === "/api/manager/notices/recipient-options") {
      state.queries.push(url);
      if (state.failed)
        return route.fulfill({
          status: 500,
          json: {
            error: "directory_unavailable",
            message: "Directory unavailable",
          },
        });
      const roleIndex = keys.indexOf(url.searchParams.get("role")!);
      let rows = Array.from(
        { length: roleIndex === 0 ? 22 : 3 },
        (_, index) => ({
          userId: `${roleIndex}-${index + 1}`,
          name: `${roles[roleIndex]} Person ${String(index + 1).padStart(2, "0")}`,
          email: `${roleIndex}-${index + 1}@example.test`,
          avatarUrl: null,
        }),
      );
      if (url.searchParams.get("classId"))
        rows = rows.filter(
          (_, index) => index === Number(url.searchParams.get("classId")) - 1,
        );
      if (url.searchParams.get("sportId"))
        rows = rows.filter(
          (_, index) => index === Number(url.searchParams.get("sportId")) - 1,
        );
      const keyword = url.searchParams.get("keyword")?.toLowerCase();
      if (keyword)
        rows = rows.filter((row) => row.name.toLowerCase().includes(keyword));
      const current = Number(url.searchParams.get("page") ?? 1);
      return json({
        items: rows.slice((current - 1) * 20, current * 20),
        totalCount: rows.length,
        page: current,
        pageSize: 20,
      });
    }
    if (
      path === "/api/manager/notices" &&
      route.request().method() === "POST"
    ) {
      state.sent = route.request().postDataJSON();
      state.sentKeys.push(route.request().headers()["idempotency-key"]);
      return json({ noticeId: "77777777-7777-4777-8777-777777777777" });
    }
    return json([]);
  });
  return state;
}

async function open(page: Page, role: string) {
  await page
    .getByRole("button", {
      name: `${l.chooseRecipients}: ${role}`,
      exact: true,
    })
    .click();
  return page.getByRole("dialog", { name: `${role} recipients`, exact: true });
}

for (const width of [1440, 390]) {
  test(`review notice opens as a popup and retains edits on close at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await fixture(page);
    await page.goto("/manager/notices");
    const member = await open(page, "Member");
    await member
      .getByRole("checkbox", { name: "Member Person 01", exact: true })
      .check();
    await member.getByRole("button", { name: l.finishSelection }).click();
    await page
      .getByLabel(en.operations.subject, { exact: true })
      .fill("Training update");
    await page
      .getByLabel(en.operations.message, { exact: true })
      .fill("Please review the new training schedule.");
    const review = page.getByRole("dialog", {
      name: l.reviewNotice,
      exact: true,
    });
    const reviewButton = page.getByRole("button", {
      name: en.operations.review,
      exact: true,
    });
    await expect(review).toHaveCount(0);
    await reviewButton.click();
    await expect(review).toBeVisible();
    await expect(review).toContainText("Training update");
    await expect(review).toContainText("Member Person 01");
    expect(state.sent).toBeNull();
    await review.screenshot({
      path: testInfo.outputPath(`notice-review-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(review).toHaveCount(0);
    await expect(
      page.getByLabel(en.operations.subject, { exact: true }),
    ).toHaveValue("Training update");
    await expect(
      page.getByRole("article", { name: "Member recipients", exact: true }),
    ).toContainText("Member Person 01");
    await reviewButton.click();
    let reject = true;
    await page.route("**/api/manager/notices", (route) =>
      reject && route.request().method() === "POST"
        ? route.fulfill({
            status: 400,
            json: {
              error: "notice_invalid",
              message: "Please check the notice.",
            },
          })
        : route.fallback(),
    );
    await review
      .getByRole("button", { name: en.operations.send, exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "Please check the notice.",
    );
    await expect(review).toBeVisible();
    reject = false;
    await review
      .getByRole("button", { name: en.operations.send, exact: true })
      .click();
    await expect(review).toHaveCount(0);
    expect(state.sent?.subject).toBe("Training update");
    expect(state.sent?.recipientUserIds).toEqual(["4-1"]);
    const success = page.getByRole("dialog", {
      name: en.common.success,
      exact: true,
    });
    await expect(success.getByRole("status")).toHaveText(l.sentSuccess);
    await expect(
      success.getByRole("button", { name: l.newNotice, exact: true }),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .include('[role="dialog"][aria-label="Success"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await success.screenshot({
      path: testInfo.outputPath(`notice-success-${width}.png`),
    });
    if (width === 390) {
      await success
        .getByRole("button", { name: l.newNotice, exact: true })
        .click();
    } else {
      await success.locator("..").click({ position: { x: 5, y: 5 } });
    }
    await expect(success).toHaveCount(0);
    await expect(
      page.getByLabel(en.operations.subject, { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel(en.operations.subject, { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel(en.operations.message, { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByRole("article", { name: "Member recipients", exact: true }),
    ).not.toContainText("Member Person 01");
    expect(new URL(page.url()).searchParams.has("noticeId")).toBe(false);
    expect(new URL(page.url()).searchParams.has("noticeKey")).toBe(false);
    await page.getByRole("switch", { name: new RegExp(l.sendToAll) }).check();
    await page
      .getByLabel(en.operations.subject, { exact: true })
      .fill("Second notice");
    await page
      .getByLabel(en.operations.message, { exact: true })
      .fill("Another announcement for everyone.");
    await reviewButton.click();
    await review
      .getByRole("button", { name: en.operations.send, exact: true })
      .click();
    await expect(success).toBeVisible();
    expect(state.sent?.subject).toBe("Second notice");
    expect(state.sent?.sendToAll).toBe(true);
    expect(state.sentKeys).toHaveLength(2);
    expect(new Set(state.sentKeys).size).toBe(2);
  });
}

for (const parameter of ["noticeId", "noticeKey"]) {
  test(`completed notice from ${parameter} can reset to a fresh editable compose form`, async ({
    page,
  }) => {
    const state = await fixture(page);
    const id = "77777777-7777-4777-8777-777777777777";
    await page.route(`**/api/manager/notices/by-key/${id}`, (route) =>
      route.fulfill({ json: { noticeId: id } }),
    );
    await page.goto(`/manager/notices?${parameter}=${id}`);
    const success = page.getByRole("dialog", {
      name: en.common.success,
      exact: true,
    });
    await expect(success.getByRole("status")).toHaveText(l.sentSuccess);
    await success.locator("..").click({ position: { x: 5, y: 5 } });
    await expect(success).toHaveCount(0);
    await expect(
      page.getByLabel(en.operations.subject, { exact: true }),
    ).toBeEditable();
    await page.reload();
    await expect(success).toHaveCount(0);
    await expect(
      page.getByLabel(en.operations.subject, { exact: true }),
    ).toBeEditable();
    expect(state.sent).toBeNull();
  });
}

test("notice compose has bottom-aligned role buttons and a system-wide send switch", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/manager/notices");
  await expect(page.getByText("0/200", { exact: true })).toHaveCount(0);
  await expect(page.getByText(l.noSelection, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(en.operations.noticeLimit, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(l.lookup, { exact: true })).toHaveCount(0);
  for (const role of roles) {
    const panel = page.getByRole("article", {
      name: `${role} recipients`,
      exact: true,
    });
    const bounds = await panel.boundingBox();
    const button = await panel
      .getByRole("button", {
        name: `${l.chooseRecipients}: ${role}`,
        exact: true,
      })
      .boundingBox();
    expect(
      bounds && button && bounds.y + bounds.height - button.y - button.height,
    ).toBeLessThan(25);
  }
  const member = await open(page, "Member");
  await member
    .getByRole("checkbox", { name: "Member Person 01", exact: true })
    .check();
  await member.getByRole("button", { name: l.finishSelection }).click();
  const broadcast = page.getByRole("switch", { name: new RegExp(l.sendToAll) });
  await broadcast.check();
  for (const role of roles)
    await expect(
      page.getByRole("button", {
        name: `${l.chooseRecipients}: ${role}`,
        exact: true,
      }),
    ).toBeDisabled();
  await broadcast.uncheck();
  await expect(
    page.getByRole("article", { name: "Member recipients", exact: true }),
  ).toContainText("Member Person 01");
  await page.screenshot({
    path: "test-results/notice-bottom-buttons-desktop.png",
    fullPage: true,
  });
  await broadcast.check();
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("System announcement");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("A notice for all active accounts.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: en.operations.send, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: en.operations.send, exact: true })
    .click();
  await expect.poll(() => state.sent?.sendToAll).toBe(true);
  expect(state.sent?.recipientUserIds).toEqual([]);
});

test("each role can target all accounts and combine with individual recipients", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/manager/notices");
  const admin = await open(page, "Admin");
  await admin
    .getByRole("checkbox", { name: "Admin Person 01", exact: true })
    .check();
  await admin.getByRole("button", { name: l.finishSelection }).click();
  const member = await open(page, "Member");
  await member
    .getByRole("checkbox", { name: "Member Person 01", exact: true })
    .check();
  await member.getByRole("button", { name: l.finishSelection }).click();
  for (const role of roles) {
    const panel = page.getByRole("article", {
      name: `${role} recipients`,
      exact: true,
    });
    await panel.getByRole("switch").check();
    await expect(
      panel.getByRole("button", {
        name: `${l.chooseRecipients}: ${role}`,
        exact: true,
      }),
    ).toBeDisabled();
    await panel.getByRole("switch").uncheck();
    await expect(
      panel.getByRole("button", {
        name: `${l.chooseRecipients}: ${role}`,
        exact: true,
      }),
    ).toBeEnabled();
  }
  const adminPanel = page.getByRole("article", {
    name: "Admin recipients",
    exact: true,
  });
  const coachPanel = page.getByRole("article", {
    name: "Coach recipients",
    exact: true,
  });
  await expect(adminPanel).toContainText("Admin Person 01");
  await adminPanel.getByRole("switch").check();
  await coachPanel.getByRole("switch").check();
  const broadcast = page.getByRole("switch", { name: new RegExp(l.sendToAll) });
  await broadcast.check();
  for (const role of roles) {
    const toggle = page
      .getByRole("article", { name: `${role} recipients`, exact: true })
      .getByRole("switch");
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
  }
  await broadcast.uncheck();
  await expect(adminPanel.getByRole("switch")).toBeChecked();
  await expect(coachPanel.getByRole("switch")).toBeChecked();
  await expect(
    page
      .getByRole("article", { name: "Member recipients", exact: true })
      .getByRole("switch"),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/notice-role-switches-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("Role notice");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("All admins, all coaches and one member.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await expect(
    page.getByText(
      "Admin: All active accounts, Coach: All active accounts, Member: 1",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.send, exact: true })
    .click();
  await expect
    .poll(() => state.sent?.sendToRoles)
    .toEqual(["SYSTEM_ADMINISTRATOR", "COACH"]);
  expect(state.sent?.recipientUserIds).toEqual(["4-1"]);
});

test("five role panels preserve selected accounts through search, pages and reopening", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/manager/notices");
  const region = page.getByRole("region", {
    name: en.operations.recipients,
    exact: true,
  });
  await expect(region.getByRole("heading", { level: 3 })).toHaveText(roles);
  const dialog = await open(page, "Admin");
  await dialog
    .getByRole("checkbox", { name: "Admin Person 01", exact: true })
    .check();
  await dialog.getByLabel(l.searchName).fill("Person 22");
  await dialog
    .getByRole("checkbox", { name: "Admin Person 22", exact: true })
    .check();
  await dialog.getByLabel(l.searchName).fill("");
  await expect(
    dialog.getByRole("checkbox", { name: "Admin Person 01", exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "Admin Person 22", exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: l.finishSelection }).click();
  await expect(
    region.getByRole("article", { name: "Admin recipients" }),
  ).toContainText("2 selected");
  const reopened = await open(page, "Admin");
  await expect(
    reopened.getByRole("checkbox", { name: "Admin Person 01", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(reopened).toHaveCount(0);
  await page.screenshot({
    path: "test-results/notice-recipient-panels-desktop.png",
    fullPage: true,
  });
});

test("member course and coach specialty filters keep selections and review all roles", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/manager/notices");
  const member = await open(page, "Member");
  await member.getByLabel(l.currentCourse).selectOption("1");
  await member
    .getByRole("checkbox", { name: "Member Person 01", exact: true })
    .check();
  await member.getByLabel(l.currentCourse).selectOption("2");
  await member
    .getByRole("checkbox", { name: "Member Person 02", exact: true })
    .check();
  await member.getByLabel(l.currentCourse).selectOption("1");
  await expect(
    member.getByRole("checkbox", { name: "Member Person 01", exact: true }),
  ).toBeChecked();
  await member.getByLabel(l.searchName).fill("no match");
  await expect(member.getByText(l.noMatchingAccounts)).toBeVisible();
  await expect(member.getByText("2 selected", { exact: true })).toBeVisible();
  await member.getByRole("button", { name: l.finishSelection }).click();
  const coach = await open(page, "Coach");
  await coach.getByLabel(l.specialty).selectOption("1");
  await coach
    .getByRole("checkbox", { name: "Coach Person 01", exact: true })
    .check();
  await coach.getByLabel(l.specialty).selectOption("2");
  await coach
    .getByRole("checkbox", { name: "Coach Person 02", exact: true })
    .check();
  await coach.getByLabel(l.specialty).selectOption("1");
  await expect(
    coach.getByRole("checkbox", { name: "Coach Person 01", exact: true }),
  ).toBeChecked();
  await coach.getByRole("button", { name: l.finishSelection }).click();
  await page
    .getByLabel(en.operations.subject, { exact: true })
    .fill("Training update");
  await page
    .getByLabel(en.operations.message, { exact: true })
    .fill("Please review the new training schedule.");
  await page
    .getByRole("button", { name: en.operations.review, exact: true })
    .click();
  await expect(
    page.getByText("Coach: 2, Member: 2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.operations.send, exact: true })
    .click();
  await expect
    .poll(() => state.sent?.recipientUserIds)
    .toEqual(["4-1", "4-2", "3-1", "3-2"]);
  expect(
    state.queries.some((query) => query.searchParams.get("classId") === "2"),
  ).toBe(true);
  expect(
    state.queries.some((query) => query.searchParams.get("sportId") === "2"),
  ).toBe(true);
});

test("popup stays usable on mobile and a failed search preserves selected accounts", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manager/notices");
  const dialog = await open(page, "Receptionist");
  await dialog
    .getByRole("checkbox", { name: "Receptionist Person 01", exact: true })
    .check();
  state.failed = true;
  await dialog.getByLabel(l.searchName).fill("Person 02");
  await expect(dialog.getByRole("alert")).toContainText(
    "Directory unavailable",
  );
  await expect(dialog.getByText("1 selected", { exact: true })).toBeVisible();
  state.failed = false;
  await dialog
    .getByRole("button", { name: en.common.retry, exact: true })
    .click();
  await dialog
    .getByRole("checkbox", { name: "Receptionist Person 02", exact: true })
    .check();
  await dialog.getByLabel(l.searchName).fill("");
  await expect(
    dialog.getByRole("checkbox", {
      name: "Receptionist Person 01",
      exact: true,
    }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/notice-recipient-popup-mobile.png",
    fullPage: true,
  });
});

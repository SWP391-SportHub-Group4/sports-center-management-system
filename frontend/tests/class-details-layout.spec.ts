import { expect, test } from "@playwright/test";

test("class details keeps capacity readable and groups management actions", async ({
  page,
}) => {
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "class-details-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path.endsWith("/threshold/pricing") ||
      path.endsWith("/threshold/waive")
    ) {
      writes.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager",
          fullName: "Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/invoices/invoice-42")
      return route.fulfill({
        json: {
          summary: {
            invoiceId: "invoice-42",
            invoiceNumber: "INV-042",
            status: "PAID",
            fulfillmentOutcome: "FULFILLED",
            totalAmount: 1200000,
            cashAmount: 1200000,
            pointsSpent: 0,
          },
          items: [
            {
              itemId: "item-42",
              description: "Badminton foundations",
              itemType: "CLASS_ENROLLMENT",
              lineAmount: 1200000,
            },
          ],
          adjustments: [],
        },
      });
    if (path === "/api/class-sessions/session-42/roster")
      return route.fulfill({
        json: {
          entries: [
            {
              enrollmentId: "e1",
              memberId: "member-1",
              memberName: "Enrolled member",
              enrollmentStatus: "CONFIRMED",
              attendanceStatus: "PRESENT",
            },
          ],
        },
      });
    if (path === "/api/classes/42/sessions")
      return route.fulfill({
        json: [
          {
            sessionId: "session-42",
            sessionNo: 1,
            classId: 42,
            status: "SCHEDULED",
            roomName: "Court A",
            coachName: "Alex Nguyen",
            startAtUtc: "2030-11-01T01:00:00Z",
            endAtUtc: "2030-11-01T02:00:00Z",
          },
        ],
      });
    if (path === "/api/manager/classes/42")
      return route.fulfill({
        json: {
          classId: 42,
          code: "BD-042",
          name: "Badminton foundations",
          status: "PUBLISHED",
          sportId: 1,
          sportName: "Badminton",
          roomName: "Court A",
          coachName: "Alex Nguyen",
          capacity: 20,
          confirmedCount: 12,
          activeHoldCount: 2,
          availableSeats: 6,
          price: 1200000,
          costAmount: 18000000,
          numSessions: 12,
          startDate: "2030-11-01",
          createdAt: "2026-10-01T01:00:00Z",
          publishedAt: "2026-10-02T01:00:00Z",
          version: 3,
          enrollmentOpen: true,
          breakEvenThreshold: 15,
          thresholdStatus: "PENDING",
          thresholdDeadlineUtc: "2030-10-29T01:00:00Z",
          firstSessionStartUtc: "2030-11-01T01:00:00Z",
        },
      });
    if (path.endsWith("/holds"))
      return route.fulfill({
        json: {
          items: [
            {
              holdId: "h1",
              memberName: "Held member",
              status: "ACTIVE",
              expiresAtUtc: "2030-11-01T01:00:00Z",
            },
          ],
          totalCount: 1,
        },
      });
    if (path.endsWith("/enrollments"))
      return route.fulfill({
        json: {
          items: [
            {
              enrollmentId: "e1",
              invoiceId: "invoice-42",
              memberName: "Enrolled member",
              status: "CONFIRMED",
              enrolledAt: "2026-10-01T01:00:00Z",
            },
          ],
          totalCount: 1,
        },
      });
    if (path.includes("audit-logs") || path.endsWith("threshold-responses"))
      return route.fulfill({ json: { items: [], totalCount: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/classes/42");
  await expect(page.getByRole("tab")).toHaveCount(4);
  const chart = page.getByRole("figure", { name: "Class capacity" });
  await expect(chart).toContainText("12/20");
  await expect(chart).toContainText("Available seats");
  const segments = await chart.locator("svg circle").evaluateAll((nodes) =>
    nodes.slice(1).map((node) => ({
      color: getComputedStyle(node).stroke,
      share: node.getAttribute("stroke-dasharray"),
    })),
  );
  expect(segments.map((segment) => segment.share)).toEqual([
    "60 40",
    "10 90",
    "30 70",
  ]);
  expect(new Set(segments.map((segment) => segment.color)).size).toBe(3);
  expect(segments[0].color).toBe("rgb(74, 222, 128)");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/class-details-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Attendance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Roster", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/class-sessions-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Attendance", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/class-sessions-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Attendance", exact: true }).click();
  const attendance = page.getByRole("dialog", {
    name: "Attendance",
    exact: true,
  });
  await expect(attendance.getByText("Enrolled member")).toBeVisible();
  expect(
    await attendance.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/class-attendance-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const heading = attendance.getByRole("columnheader", {
    name: "Attendance",
    exact: true,
  });
  expect(
    await heading.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  await page.screenshot({
    path: "test-results/class-attendance-desktop.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(attendance).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("More actions", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(page.getByText("Enrolled member")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Choice", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Students", exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-students-desktop.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "View invoice", exact: true }).click();
  const invoice = page.getByRole("dialog", { name: "Invoice", exact: true });
  await expect(invoice).toContainText("INV-042");
  await page.keyboard.press("Escape");
  await expect(invoice).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "View invoice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Students", exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-students-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Seat holds 2", exact: true }).click();
  await expect(page.getByText("Held member")).toBeVisible();
  await page.route("**/api/manager/classes/42/holds?**", (route) =>
    route.fulfill({ json: { items: [], totalCount: 0 } }),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await page.getByRole("button", { name: /^Seat holds/ }).click();
  await expect(page.getByText("No active seat holds.")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("tab", { name: "Management", exact: true }).click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByText("Enrollment is open", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-management-enrollment-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(
    page.getByRole("button", { name: "Close enrollment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reopen enrollment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Enrollment is managed automatically and closes when the class is full or starts.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel class", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "This class has enrolled students. Reschedule a session, change the room, or assign another coach instead.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/manager/classes/42?tab=threshold");
  await expect(
    page.getByRole("tab", { name: "Management", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-management-opening-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit pricing", exact: true }).click();
  const pricing = page.getByRole("dialog", {
    name: "Edit pricing",
    exact: true,
  });
  await expect(
    pricing.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await pricing
    .getByLabel("Tuition per student (VND)", { exact: true })
    .fill("1000000");
  await pricing
    .getByLabel("Reason", { exact: true })
    .fill("Adjusted course pricing");
  await pricing.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pricing).toHaveCount(0);
  expect(writes.at(-1)).toEqual({
    path: "/api/manager/classes/42/threshold/pricing",
    body: {
      price: 1000000,
      costAmount: 18000000,
      reason: "Adjusted course pricing",
    },
  });
  await page
    .getByRole("button", { name: "Approve below threshold", exact: true })
    .click();
  const waiver = page.getByRole("dialog", {
    name: "Approve below threshold",
    exact: true,
  });
  await expect(waiver.getByLabel("Reason", { exact: true })).toHaveValue("");
  await waiver
    .getByLabel("Reason", { exact: true })
    .fill("Run class for existing students");
  await waiver
    .getByRole("button", { name: "Approve below threshold", exact: true })
    .click();
  await expect(waiver).toHaveCount(0);
  expect(writes.at(-1)).toEqual({
    path: "/api/manager/classes/42/threshold/waive",
    body: { reason: "Run class for existing students" },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-management-opening-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Enrollment", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/class-management-enrollment-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/manager/classes/42?tab=history");
  await expect(page.getByText("Version", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 640, height: 900 });
  expect(
    await chart.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/class-details-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

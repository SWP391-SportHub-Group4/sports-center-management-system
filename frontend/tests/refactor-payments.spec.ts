import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// HTTP UI regressions. Real PostgreSQL/payment tests are separate.
const id = "11111111-1111-1111-1111-111111111111";
async function setup(page: Page, overrides: Record<string, unknown> = {}) {
  const state = {
    invoiceId: id,
    kind: "CLASS",
    state: "ACTIVE",
    invoiceStatus: "ISSUED",
    totalAmount: 200000,
    pointsApplied: 0,
    cashAmount: 200000,
    expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
    serverNowUtc: new Date().toISOString(),
    revision: 1,
    fulfillmentOutcome: "NONE",
    reconciliationRequired: false,
    ...overrides,
  };
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "test-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST") writes.push(path);
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "member-1",
          email: "member@example.com",
          fullName: "Current Member",
          role: "MEMBER",
          sportIds: [],
        },
      });
    if (path === "/api/wallet/me")
      return route.fulfill({
        json: { availablePoints: 500, heldPoints: 0, vndPerPoint: 1000 },
      });
    if (path === `/api/invoices/${id}`)
      return route.fulfill({
        json: {
          summary: {
            memberName: "Current Member",
            memberEmail: "member@example.com",
          },
          items: [
            {
              itemId: "item-1",
              description: "Course purchase",
              lineAmount: 200000,
            },
          ],
        },
      });
    if (path.endsWith("/points")) {
      state.pointsApplied = req.postDataJSON().points;
      state.cashAmount = state.totalAmount - state.pointsApplied * 1000;
      state.revision++;
      return route.fulfill({ json: state });
    }
    if (path.endsWith("/confirm-points")) {
      state.invoiceStatus = "PAID";
      state.fulfillmentOutcome = "FULFILLED";
      return route.fulfill({ json: state });
    }
    if (path.endsWith("/cancel")) {
      state.state = "CANCELLED";
      return route.fulfill({ json: state });
    }
    if (path.endsWith("/attempts"))
      return route.fulfill({
        json: {
          paymentAttemptId: "attempt-1",
          invoiceId: id,
          cashAmount: state.cashAmount,
          pointsApplied: state.pointsApplied,
          paymentUrl: "https://payment.example.test/verified-reference",
          gatewayMode: "MOCK",
          expiresAtUtc: state.expiresAtUtc,
          status: "PENDING",
        },
      });
    if (path.startsWith("/api/checkouts/"))
      return route.fulfill({ json: state });
    return route.fulfill({ json: [] });
  });
  return { state, writes };
}

test("return query never marks an unverified invoice paid", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.goto(`/payments/return?invoiceId=${id}&vnp_ResponseCode=00`);
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await page.reload();
  await expect(
    page.getByText("Course purchase", { exact: false }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test("full points confirms explicitly without creating a gateway attempt", async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.goto(`/payments/return?invoiceId=${id}`);
  await page.getByRole("spinbutton").fill("200");
  await page.getByRole("button", { name: "Apply points", exact: true }).click();
  await expect
    .poll(() => writes.filter((p) => p.endsWith("/points")).length)
    .toBe(1);
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  expect(writes.some((p) => p.endsWith("/confirm-points"))).toBeTruthy();
  expect(writes.some((p) => p.endsWith("/attempts"))).toBeFalsy();
  await expect(
    page.getByRole("link", { name: "Open payment gateway" }),
  ).toHaveCount(0);
});

test("changing points discards the previous payment link", async ({ page }) => {
  await setup(page);
  await page.goto(`/payments/return?invoiceId=${id}`);
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open payment gateway" }),
  ).toBeVisible();
  await page.getByRole("spinbutton").fill("50");
  await page.getByRole("button", { name: "Apply points", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open payment gateway" }),
  ).toHaveCount(0);
});

test("cancel calls backend and stays cancelled on F5", async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto(`/payments/return?invoiceId=${id}`);
  await page
    .getByRole("button", { name: "Cancel checkout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  expect(writes.filter((p) => p.endsWith("/cancel"))).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByText("Course purchase", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
});

test("late compensated payment is distinct from fulfilled service", async ({
  page,
}) => {
  const { writes } = await setup(page, {
    invoiceStatus: "PAID_AFTER_RECONCILIATION",
    fulfillmentOutcome: "COMPENSATED",
    state: "EXPIRED",
  });
  await page.goto(`/payments/return?invoiceId=${id}`);
  await expect(
    page.getByText("Payment refunded to wallet; service was not fulfilled."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("reconciliation disables payment and new checkout", async ({ page }) => {
  await setup(page, { reconciliationRequired: true });
  await page.goto(`/payments/return?invoiceId=${id}`);
  await expect(
    page.getByText("Payment needs reconciliation. Contact reception."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create a new checkout", exact: true }),
  ).toHaveCount(0);
});

test("timeout after create recovers by the same idempotency key before any second POST", async ({
  page,
}) => {
  const { state } = await setup(page);
  let key = "";
  let creates = 0;
  await page.route("**/api/classes/1", (route) =>
    route.fulfill({
      json: {
        classId: 1,
        name: "Recovery course",
        sportName: "Badminton",
        coachName: "Coach",
        roomName: "Court 1",
        price: 200000,
        availableSeats: 2,
      },
    }),
  );
  await page.route("**/api/checkouts/class", async (route) => {
    creates++;
    key = route.request().headers()["idempotency-key"];
    await route.abort("failed");
  });
  await page.route("**/api/checkouts/by-key?**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("key")).toBe(key);
    await route.fulfill({ json: state });
  });
  await page.goto("/courses/1");
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeVisible();
  expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(creates).toBe(1);
  await expect(page).toHaveURL(`/checkout/${id}`);
});

test("owned checkout denial renders an error without payment controls", async ({
  page,
}) => {
  await setup(page);
  await page.route(`**/api/checkouts/${id}`, (route) =>
    route.fulfill({
      status: 403,
      json: { code: "forbidden", message: "Invoice ownership denied" },
    }),
  );
  await page.goto(`/payments/return?invoiceId=${id}`);
  await expect(page.locator("main p[role=alert]")).toContainText(
    "Invoice ownership denied",
  );
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
});

test("counter confirmation resumes, locks after five wrong codes and never exposes a QR", async ({
  page,
}) => {
  const { writes } = await setup(page, { beneficiaryUserId: "member-1" });
  const confirmation = {
    confirmationId: "confirmation-1",
    points: 50,
    revision: 1,
    failedAttempts: 0,
    status: "PENDING",
    expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
    resendAtUtc: new Date(Date.now() + 60000).toISOString(),
  };
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: {
        userId: "staff-1",
        role: "RECEPTIONIST",
        fullName: "Receptionist",
        sportIds: [],
      },
    }),
  );
  await page.route("**/api/members/member-1/points", (route) =>
    route.fulfill({
      json: { availablePoints: 500, heldPoints: 0, vndPerPoint: 1000 },
    }),
  );
  await page.route(
    `**/api/invoices/${id}/point-confirmations/current`,
    (route) => route.fulfill({ json: confirmation }),
  );
  await page.route(
    "**/api/point-confirmations/confirmation-1/verify",
    async (route) => {
      confirmation.failedAttempts++;
      if (confirmation.failedAttempts === 5) confirmation.status = "LOCKED";
      await route.fulfill({
        status: 400,
        json: { error: "invalid_code", message: "Incorrect confirmation code" },
      });
    },
  );
  await page.goto(`/payments/return?invoiceId=${id}`);
  const pay = page.getByRole("button", {
    name: "Confirm payment",
    exact: true,
  });
  await expect(pay).toBeDisabled();
  const code = page.getByRole("textbox", {
    name: "Member confirmation code",
    exact: true,
  });
  for (let attempt = 1; attempt <= 5; attempt++) {
    await code.fill("999999");
    await page
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    await expect.poll(() => confirmation.failedAttempts).toBe(attempt);
    await expect(page.locator("main p[role=alert]")).toContainText(
      "Incorrect confirmation code",
    );
    if (attempt < 5)
      await expect(
        page.getByRole("button", { name: "Verify code", exact: true }),
      ).toBeEnabled();
  }
  await expect(code).toBeDisabled();
  await expect(pay).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Open payment gateway" }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(code).toBeDisabled();
  await expect(pay).toBeDisabled();
});

test("public landing and catalog fit mobile and desktop and pass WCAG", async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await page.addInitScript(() =>
    localStorage.removeItem("sporthub.accessToken"),
  );
  await page.route("**/api/sports", (route) =>
    route.fulfill({
      json: [
        {
          sportId: 3,
          name: "Badminton",
          description: "Group courses",
          code: "course", services: [{ serviceType: "GROUP_COURSE", isEnabled: true, defaultSessionMinutes: 90, defaultMaxCapacity: 12 }],
          isActive: true,
        },
        {
          sportId: 2,
          name: "Personal training",
          description: "One-on-one training",
          code: "gym", services: [{ serviceType: "PERSONAL_TRAINING", isEnabled: true, defaultSessionMinutes: null, defaultMaxCapacity: null }],
          isActive: true,
        },
      ],
    }),
  );
  await page.route("**/api/membership-packages/public**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/classes?**", (route) =>
    route.fulfill({
      json: { items: [], page: 1, pageSize: 12, totalCount: 0 },
    }),
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/courses"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: `test-results/p2-public-${path === "/" ? "home" : "courses"}-${width}.png`,
        fullPage: true,
      });
    }
  }
});

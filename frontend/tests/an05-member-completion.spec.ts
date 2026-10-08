import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ reducedMotion: "reduce" });

const responseId = "55555555-5555-4555-8555-555555555555";
const session = {
  sessionId: "s1",
  classId: 7,
  className: "Badminton basics",
  sportName: "Badminton",
  startAtUtc: "2030-06-10T02:00:00Z",
  endAtUtc: "2030-06-10T03:30:00Z",
  coachName: "Minh",
  roomName: "Court 1",
  status: "SCHEDULED",
};

async function install(
  page: Page,
  options: {
    expired?: boolean;
    forbidden?: boolean;
    conflict?: boolean;
    manager?: boolean;
  } = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  const writes: unknown[] = [];
  let choice: string | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ json: body, status });
    if (url.pathname === "/api/users/me")
      return json({
        userId: "11111111-1111-4111-8111-111111111111",
        fullName: "Alex Nguyen",
        email: "alex@example.com",
        role: options.manager ? "CENTER_MANAGER" : "MEMBER",
        sportIds: [],
      });
    if (url.pathname.includes("notifications"))
      return json(url.pathname.endsWith("unread-count") ? { count: 0 } : []);
    if (url.pathname.endsWith("/transfer-quote"))
      return json({
        targetClassId: Number(url.searchParams.get("targetClassId")),
        targetPrice: 700000,
        sourceValue: 600000,
        cashDifference: 100000,
        walletCreditPoints: 0,
      });
    if (url.pathname === `/api/class-threshold-responses/${responseId}`) {
      if (options.forbidden)
        return json(
          {
            error: "threshold_response_not_owned",
            message: "Not your response",
          },
          403,
        );
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        writes.push(body);
        choice = body.choice;
        if (options.conflict)
          return json(
            {
              error: "threshold_response_already_submitted",
              message: "Response already submitted",
            },
            409,
          );
        return json({ choice, resolutionStatus: "COMPLETED" });
      }
      // Actual backend serializes these fields with ToString() (PascalCase).
      return json({
        responseId,
        classId: 7,
        className: "Badminton basics",
        sportId: 3,
        paidValueVnd: 600000,
        choice,
        targetClassId: choice === "TRANSFER" ? 8 : null,
        resolutionStatus: choice ? "Completed" : "Pending",
        additionalInvoiceId: null,
        deadlineUtc: options.expired
          ? "2030-06-09T00:00:00Z"
          : "2030-06-12T00:00:00Z",
        serverNowUtc: "2030-06-10T00:00:00Z",
      });
    }
    if (url.pathname === "/api/classes")
      return json({
        items: [
          {
            classId: 8,
            name: "Evening badminton",
            sportId: 3,
            status: "PUBLISHED",
            availableSeats: 4,
            price: 700000,
            coachName: "Minh",
            firstSessionStartUtc: "2030-07-01T12:00:00Z",
          },
          {
            classId: 9,
            name: "Full class",
            sportId: 3,
            status: "PUBLISHED",
            availableSeats: 0,
            price: 600000,
          },
          {
            classId: 10,
            name: "Wrong sport",
            sportId: 4,
            status: "PUBLISHED",
            availableSeats: 4,
            price: 600000,
          },
        ],
        totalCount: 3,
      });
    if (url.pathname === "/api/members/me/schedule") return json([session]);
    if (url.pathname === "/api/ai/chat")
      return json({
        interactionId: "i1",
        answer: "Your badminton session is at 09:00.",
        createdAt: "2030-06-10T00:00:00Z",
      });
    if (url.pathname === "/api/members/me/enrollments")
      return json({ items: [], totalCount: 0 });
    if (request.method() !== "GET")
      throw new Error(
        `Unexpected mutation: ${request.method()} ${url.pathname}`,
      );
    return json([]);
  });
  return writes;
}

test("threshold requires a conscious choice and confirmation; wait remains blocked", async ({
  page,
}, info) => {
  const writes = await install(page);
  await page.goto(`/member/threshold-responses/${responseId}`);
  await expect(page.getByRole("radio")).toHaveCount(3);
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review response" }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /^Wait for/ }).check();
  await expect(
    page.getByText("No response has been sent", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review response" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
  expect(
    (
      await new AxeBuilder({ page })
        .include("fieldset")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("threshold-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("radio", { name: /^Refund 100/ }).check();
  await page.getByRole("button", { name: "Review response" }).click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm response", exact: true })
    .click();
  await expect(
    page.getByText("Your response has been recorded", { exact: false }),
  ).toBeVisible();
  expect(writes).toEqual([{ choice: "REFUND", targetClassId: null }]);
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("transfer filters destination classes and confirms server quote on mobile", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await install(page);
  await page.goto(`/member/threshold-responses/${responseId}`);
  await page.getByRole("radio", { name: /^Transfer to/ }).check();
  await page.getByLabel("Destination class").selectOption("8");
  await expect(
    page.getByRole("option", { name: /Full class|Wrong sport/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review response" }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("threshold-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Review response" }).click();
  await page
    .getByRole("button", { name: "Confirm response", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ choice: "TRANSFER", targetClassId: 8 });
});

test("server clock expiry and wrong-owner responses never offer a mutation", async ({
  page,
}) => {
  const writes = await install(page, { expired: true });
  await page.goto(`/member/threshold-responses/${responseId}`);
  await expect(
    page.getByText("The response deadline has passed", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.unrouteAll();
  await install(page, { forbidden: true });
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "Not your response" }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("conflict reconciles the final server choice instead of reopening financial decisions", async ({
  page,
}) => {
  await install(page, { conflict: true });
  await page.goto(`/member/threshold-responses/${responseId}`);
  await page.getByRole("radio", { name: /^Refund 100/ }).check();
  await page.getByRole("button", { name: "Review response" }).click();
  await page
    .getByRole("button", { name: "Confirm response", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Response already submitted" }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("AI leaves desktop calendar interactive and links to the exact server session", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await install(page);
  await page.goto("/member/schedule?date=2030-06-10");
  await page.getByRole("button", { name: /Ask SportHub/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).not.toHaveAttribute("aria-modal", "true");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Day", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await drawer.locator("textarea").fill("What is on my schedule?");
  await drawer.locator("textarea").press("Enter");
  await expect(
    drawer.getByText("Your badminton session is at 09:00."),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("assistant-calendar-desktop.png"),
    fullPage: true,
  });
  await drawer.getByRole("link", { name: /09:00.*Badminton basics/ }).click();
  await expect(page).toHaveURL(/event=class%3As1/);
  await expect(
    page.getByRole("dialog", { name: "Badminton basics" }),
  ).toBeVisible();
});

test("AI retains modal keyboard behavior on mobile", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await page.goto("/member/schedule?date=2030-06-10");
  const launcher = page.getByRole("button", { name: /Ask SportHub/ });
  await launcher.click();
  await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  await page.screenshot({
    path: info.outputPath("assistant-mobile.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test("member interests has a truthful blocked state and a labeled isolated demo", async ({
  page,
}, info) => {
  const writes = await install(page);
  await page.goto("/member/courses?tab=interests");
  await expect(
    page.getByText("Course-interest subscriptions are not available yet.", {
      exact: false,
    }),
  ).toBeVisible();
  // Production intentionally exposes only the unavailable state, never fixture controls.
  if (
    !(await page
      .getByRole("button", { name: "Preview demo (sample data)" })
      .count())
  )
    return;
  await page
    .getByRole("button", { name: "Preview demo (sample data)" })
    .click();
  await expect(page.getByText("DEMO · Sample data")).toBeVisible();
  await page.getByRole("button", { name: "Unsubscribe (sample)" }).click();
  await page.getByRole("button", { name: "Confirm (sample)" }).click();
  await expect(
    page.getByRole("button", { name: "Unsubscribe (sample)" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "600", exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath("interests-demo-desktop.png"),
    fullPage: true,
  });
});

test("manager interests filters fixture data without financial mutations", async ({
  page,
}) => {
  const writes = await install(page, { manager: true });
  await page.goto("/manager/classes/interests");
  await expect(
    page.getByText("Course-interest subscriptions are not available yet.", {
      exact: false,
    }),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "Preview demo (sample data)" })
      .count())
  )
    return;
  await page
    .getByRole("button", { name: "Preview demo (sample data)" })
    .click();
  await page.getByLabel("Sport", { exact: true }).selectOption("Badminton");
  await page.getByLabel("Notifications", { exact: true }).selectOption("false");
  await expect(
    page.getByText("No interests match these filters."),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

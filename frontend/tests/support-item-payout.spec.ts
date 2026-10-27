import { expect, test, type Page } from "@playwright/test";

const requestId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const managerId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const itemA = "55555555-5555-4555-8555-555555555555";
const itemB = "66666666-6666-4666-8666-666666666666";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=",
  "base64",
);

async function install(
  page: Page,
  role: "manager" | "member" = "manager",
  legacy = false,
  supportsEnteredPoints = true,
  cashOnly = false,
) {
  const state = {
    fail: false,
    amount: cashOnly ? 100000 : 80000,
    posts: [] as string[],
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "item-refund-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    const row = {
      requestId,
      memberId,
      recordedByUserId: memberId,
      category: "PAYMENT",
      subject: "Refund Service A",
      description: "Please refund Service A only",
      status: "ASSIGNED",
      assignedToUserId: managerId,
      assignedToName: "Manager",
      memberName: "Alex Member",
      memberEmail: "alex@example.test",
      channel: "ONLINE",
      createdAt: "2026-10-25T01:00:00Z",
      invoiceId,
      invoiceItemId: legacy ? null : itemA,
      attachments: [],
    };
    const items = [itemA, itemB].map((id, index) => ({
      invoiceItemId: id,
      description: `Service ${index ? "B" : "A"}`,
      totalVnd: 100000,
      vnpayVnd: cashOnly ? 100000 : 80000,
      pointsApplied: cashOnly ? 0 : 20,
      pointsVnd: cashOnly ? 0 : 20000,
      refundableVnpayVnd: index ? 80000 : state.amount,
      refundablePoints: cashOnly ? 0 : 20,
      ...(cashOnly
        ? { refundableValueVnd: 100000, maxRefundablePoints: 100 }
        : {}),
    }));
    if (path === "/api/users/me")
      return json({
        userId: role === "manager" ? managerId : memberId,
        role: role === "manager" ? "CENTER_MANAGER" : "MEMBER",
        fullName: "Alex",
        email: "alex@example.test",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/manager/requests/summary") return json({ support: 1 });
    if (path === "/api/member-support-requests/stats")
      return json({
        open: 0,
        assigned: 1,
        inProgress: 0,
        done: 0,
        rejected: 0,
      });
    if (path === "/api/member-support-requests/assignees")
      return json([
        { userId: managerId, name: "Manager", role: "CenterManager" },
      ]);
    if (path === "/api/member-support-requests/queue")
      return json({ items: [row], totalCount: 1, page: 1, pageSize: 20 });
    if (path === `/api/member-support-requests/${requestId}`) return json(row);
    if (path.endsWith("/payout-quote"))
      return json({
        invoiceItemId: legacy ? null : itemA,
        supportsEnteredPoints,
        items,
      });
    if (path.endsWith("/refund-breakdown"))
      return json({
        totalVnd: 200000,
        vnpayVnd: 160000,
        pointsApplied: 40,
        pointsVnd: 40000,
        refundableVnpayVnd: 160000,
        refundablePoints: 40,
        items,
      });
    if (path === `/api/invoices/${invoiceId}`)
      return json({ summary: { invoiceNumber: "INV-ITEMS" } });
    if (path.endsWith("/payout")) {
      state.posts.push(route.request().postData() ?? "");
      if (state.fail) {
        state.amount = 60000;
        return route.fulfill({
          status: 409,
          json: { error: "payout_amount_mismatch", message: "Amount mismatch" },
        });
      }
      const selectedPoints = Number(
        state.posts.at(-1)?.match(/name="PointsRefunded"\r\n\r\n(\d+)/)?.[1] ??
          0,
      );
      return json({ pointsRefunded: selectedPoints });
    }
    if (
      path === "/api/support/requests" &&
      route.request().method() === "POST"
    ) {
      state.posts.push(route.request().postData() ?? "");
      return json({ requestId, reference: "REFUND-A" });
    }
    if (path === `/api/users/${memberId}`)
      return json({
        userId: memberId,
        fullName: "Alex Member",
        email: "alex@example.test",
      });
    return json([]);
  });
  return state;
}

test("manager edits cash and points with inline validation and refreshes stale quote", async ({
  page,
}) => {
  const state = await install(page);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  const amount = payout.getByRole("spinbutton", {
    name: "Cash amount transferred (VND)",
  });
  const points = payout.getByRole("spinbutton", {
    name: "Point amount transferred",
  });
  await expect(amount).toHaveValue("80000");
  await expect(points).toHaveValue("20");
  await amount.fill("80500");
  await expect(payout.getByText("Use multiples of 1,000 VND.")).toBeVisible();
  await amount.fill("80000");
  await points.fill("20.5");
  await expect(payout.getByText("Enter whole points.")).toBeVisible();
  await points.fill("21");
  await expect(payout.getByText("Maximum 20 points.")).toBeVisible();
  await points.fill("20");
  await expect(
    payout.getByRole("combobox", { name: "Service to refund" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Mark as done", exact: true }),
  ).toHaveCount(0);
  await payout
    .getByLabel("Transfer proof", { exact: false })
    .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
  await payout
    .getByLabel("Note about the call and refund (required)")
    .fill("Called the member and transferred the VNPay share.");
  const confirmation = payout.getByRole("checkbox");
  await confirmation.check();
  state.fail = true;
  await payout
    .getByRole("button", { name: "Record payout", exact: true })
    .click();
  await expect(payout.getByText("Maximum 60,000 ₫.")).toBeVisible();
  await expect(amount).toHaveValue("80000");
  await expect(confirmation).not.toBeChecked();
  await expect(
    payout.getByRole("button", { name: "Record payout", exact: true }),
  ).toBeDisabled();
  expect(state.posts[0]).toContain(itemA);
  expect(state.posts[0]).toContain('name="PointsRefunded"');
  expect(state.posts[0]).not.toContain(itemB);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(amount).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/support-item-payout-mobile.png",
    fullPage: true,
  });
});

test("legacy multi-service request requires an explicit service selection", async ({
  page,
}) => {
  await install(page, "manager", true);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  const amount = payout.getByRole("spinbutton", {
    name: "Cash amount transferred (VND)",
  });
  await expect(amount).toHaveValue("");
  await payout
    .getByRole("combobox", { name: "Service to refund" })
    .selectOption(itemB);
  await expect(amount).toHaveValue("80000");
});

for (const [cash, points] of [
  [100000, 0],
  [0, 100],
  [40000, 60],
]) {
  test(`cash-paid invoice can refund ${cash} VND and ${points} points`, async ({
    page,
  }) => {
    const state = await install(page, "manager", false, true, true);
    await page.goto("/manager/requests?type=support");
    const payout = page.getByRole("region", { name: "Payment payout" });
    const cashInput = payout.getByRole("spinbutton", {
      name: "Cash amount transferred (VND)",
    });
    const pointsInput = payout.getByRole("spinbutton", {
      name: "Point amount transferred",
    });
    await expect(pointsInput).toHaveValue("0");
    await cashInput.fill(String(cash));
    await pointsInput.fill(String(points + 1));
    await expect(
      payout.getByText(`Maximum ${points} points.`, { exact: true }),
    ).toBeVisible();
    await expect(
      payout.getByRole("button", { name: "Record payout", exact: true }),
    ).toBeDisabled();
    await pointsInput.fill(String(points));
    if (cash > 0) {
      await payout.getByLabel("Transfer proof", { exact: true }).setInputFiles({
        name: "refund.png",
        mimeType: "image/png",
        buffer: png,
      });
    }
    await payout
      .getByLabel("Note about the call and refund (required)")
      .fill("Agreed cash and point refund with member.");
    await payout.getByRole("checkbox").check();
    await payout
      .getByRole("button", { name: "Record payout", exact: true })
      .click();
    await expect.poll(() => state.posts.length).toBe(1);
    expect(state.posts[0]).toContain(`name="Amount"\r\n\r\n${cash}\r\n`);
    expect(state.posts[0]).toContain(
      `name="PointsRefunded"\r\n\r\n${points}\r\n`,
    );
  });
}

test("manager submits 10 points when the service allows a maximum of 20", async ({
  page,
}) => {
  const state = await install(page);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  await payout
    .getByRole("spinbutton", { name: "Cash amount transferred (VND)" })
    .fill("0");
  await payout
    .getByRole("spinbutton", { name: "Point amount transferred" })
    .fill("10");
  await payout
    .getByLabel("Note about the call and refund (required)")
    .fill("Approved points refund.");
  await expect(payout.getByRole("checkbox")).toBeEnabled();
  await expect(
    payout.getByRole("button", { name: "Record payout", exact: true }),
  ).toBeDisabled();
  await payout.getByRole("checkbox").check();
  await payout
    .getByRole("button", { name: "Record payout", exact: true })
    .click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toContain('name="Amount"');
  expect(state.posts[0]).toMatch(/name="PointsRefunded"\r\n\r\n10\r\n/);
  expect(state.posts[0]).not.toMatch(/name="PointsRefunded"\r\n\r\n20\r\n/);
  expect(state.posts[0]).not.toContain('name="Files"');
});

test("manager can record cash with zero points, while both zero is invalid", async ({
  page,
}) => {
  const state = await install(page);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  const cash = payout.getByRole("spinbutton", {
    name: "Cash amount transferred (VND)",
  });
  const points = payout.getByRole("spinbutton", {
    name: "Point amount transferred",
  });
  const record = payout.getByRole("button", {
    name: "Record payout",
    exact: true,
  });
  await cash.fill("0");
  await points.fill("0");
  await payout
    .getByLabel("Note about the call and refund (required)")
    .fill("Approved cash refund only.");
  await payout.getByRole("checkbox").check();
  await expect(record).toBeDisabled();
  await expect(
    payout.getByText("Enter cash or points to refund."),
  ).toBeVisible();
  await cash.fill("80000");
  await payout
    .getByLabel("Transfer proof", { exact: true })
    .setInputFiles({ name: "cash.png", mimeType: "image/png", buffer: png });
  await payout.getByRole("checkbox").check();
  await expect(record).toBeEnabled();
  await record.click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatch(/name="PointsRefunded"\r\n\r\n0\r\n/);
});

test("manager cannot submit selected points to an older payout service", async ({
  page,
}) => {
  const state = await install(page, "manager", false, false);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  await payout
    .getByRole("spinbutton", { name: "Point amount transferred" })
    .fill("10");
  await payout
    .getByLabel("Transfer proof", { exact: false })
    .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
  await payout
    .getByLabel("Note about the call and refund (required)")
    .fill("Approved only 10 of the 20 available points.");
  await payout.getByRole("checkbox").check();
  await expect(
    payout.getByText(/cannot record the entered point amount yet/),
  ).toBeVisible();
  await expect(
    payout.getByRole("button", { name: "Record payout", exact: true }),
  ).toBeEnabled();
  await payout
    .getByRole("button", { name: "Record payout", exact: true })
    .click();
  await expect(payout.getByText(/Cannot record this refund yet/)).toBeVisible();
  expect(state.posts).toHaveLength(0);
});

test("manager previews, adds and removes payout proof before submitting", async ({
  page,
}) => {
  const state = await install(page);
  await page.goto("/manager/requests?type=support");
  const payout = page.getByRole("region", { name: "Payment payout" });
  const picker = payout.getByLabel("Transfer proof", { exact: true });
  const file = (name: string) => ({ name, mimeType: "image/png", buffer: png });
  const previews = payout.getByRole("list", {
    name: "Selected transfer proof",
  });
  await picker.setInputFiles([file("first.png"), file("second.png")]);
  await expect(previews.getByRole("img")).toHaveCount(2);
  await expect(
    previews.getByRole("img", { name: "first.png", exact: true }),
  ).toBeVisible();
  await picker.setInputFiles(file("third.png"));
  await expect(previews.getByRole("img")).toHaveCount(3);
  await expect(
    payout.getByRole("button", { name: "Add more images" }),
  ).toBeDisabled();
  await picker.setInputFiles(file("fourth.png"));
  await expect(
    payout.getByText(
      "Attach no more than 3 images. Remove an image to add another.",
    ),
  ).toBeVisible();
  await expect(previews.getByRole("img")).toHaveCount(3);
  await payout
    .getByLabel("Note about the call and refund (required)")
    .fill("Transferred and checked proof.");
  await payout.getByRole("checkbox").check();
  await previews
    .getByRole("button", { name: "Remove second.png", exact: true })
    .click();
  await expect(previews.getByRole("img")).toHaveCount(2);
  await expect(payout.getByRole("checkbox")).not.toBeChecked();
  await picker.setInputFiles(file("fourth.png"));
  await expect(previews.getByRole("img")).toHaveCount(3);
  await expect(
    previews.getByRole("img", { name: "second.png", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      previews
        .getByRole("img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await previews.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await payout.screenshot({
    path: "test-results/payout-proof-previews-mobile.png",
  });
  await payout.getByRole("checkbox").check();
  await payout
    .getByRole("button", { name: "Record payout", exact: true })
    .click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toContain('filename="first.png"');
  expect(state.posts[0]).toContain('filename="third.png"');
  expect(state.posts[0]).toContain('filename="fourth.png"');
  expect(state.posts[0]).not.toContain('filename="second.png"');
});

test("member selects one invoice service and submits its reference", async ({
  page,
}) => {
  const state = await install(page, "member");
  await page.goto(
    `/member/help?topic=PAYMENT&invoiceId=${invoiceId}&invoiceItemId=${itemB}`,
  );
  const service = page.getByRole("combobox", {
    name: "Service requiring support",
  });
  await expect(service).toHaveValue(itemB);
  await expect(page.getByLabel("Invoice breakdown")).toContainText("Service B");
  await page
    .getByRole("textbox", { name: "What happened?" })
    .fill("Please review the payment for Service B.");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "payment.png", mimeType: "image/png", buffer: png });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toContain(itemB);
  expect(state.posts[0]).not.toContain(itemA);
});

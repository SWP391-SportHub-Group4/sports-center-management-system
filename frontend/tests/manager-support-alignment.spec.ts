import { expect, test, type Page } from "@playwright/test";

const requestId = "abcdef12-2222-4222-8222-222222222222";
const memberId = "11111111-1111-4111-8111-111111111111";
const managerId = "33333333-3333-4333-8333-333333333333";
const message =
  "The basketball court light is broken.\nPlease check before the next class.";

async function install(page: Page, deepLink = false) {
  const state = {
    role: "CENTER_MANAGER",
    status: "ASSIGNED",
    reply: "We are checking the court.",
  };
  const writes: Record<string, unknown>[] = [];
  const member = {
    userId: memberId,
    role: "MEMBER",
    fullName: "Member An",
    email: "an@example.com",
    status: "ACTIVE",
    sportIds: [],
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "support-alignment");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    const row = {
      requestId,
      memberId,
      recordedByUserId: memberId,
      memberName: member.fullName,
      memberEmail: member.email,
      category: "FACILITY",
      subject: "Facilities: The basketball court light is broken.",
      description: message,
      status: state.status,
      progressNote: state.reply,
      createdAt: "2026-10-23T02:00:00Z",
      updatedAt: "2026-10-23T03:00:00Z",
      closedAt: null,
      assignedToUserId: managerId,
      assignedToName: "Manager",
      channel: "ONLINE",
      attachments: [{ attachmentId: "image-1", fileName: "court-light.png" }],
    };
    if (path === "/api/users/me")
      return json(
        state.role === "MEMBER"
          ? member
          : {
              userId: managerId,
              role: state.role,
              fullName: "Manager",
              email: "manager@example.com",
              sportIds: [],
            },
      );
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/manager/requests/summary") return json({ support: 1 });
    if (path === "/api/support/requests/mine")
      return json([{ ...row, response: state.reply }]);
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
      return json({
        items: deepLink ? [] : [row],
        totalCount: deepLink ? 0 : 1,
        page: 1,
        pageSize: 20,
      });
    if (path === `/api/member-support-requests/${requestId}`) return json(row);
    if (
      route.request().method() === "POST" &&
      path.startsWith("/api/member-support-requests")
    ) {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (path.endsWith("/progress")) {
        state.reply = body.note;
        state.status = "IN_PROGRESS";
      }
      if (path.endsWith("/done")) {
        state.reply = body.reason;
        state.status = "DONE";
      }
      if (path.endsWith("/reject")) {
        state.reply = body.reason;
        state.status = "REJECTED";
      }
      return json({ requestId });
    }
    if (path === `/api/users/${memberId}`) return json(member);
    if (path === "/api/users")
      return json({ items: [member], totalCount: 1, page: 1, pageSize: 20 });
    if (path === "/api/support/attachments/image-1")
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    return json([]);
  });
  return { state, writes };
}

test("manager shows the member topic, message, images and public reply on desktop and mobile", async ({
  page,
}) => {
  const { state } = await install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/manager/requests?type=support");
  const detail = page.getByRole("region", { name: "Request message" });
  await expect(detail.getByText(message, { exact: true })).toBeVisible();
  await expect(detail.getByText("Facilities", { exact: true })).toBeVisible();
  await expect(
    detail.getByText("an@example.com", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Reference: ABCDEF12")).toBeVisible();
  await expect(
    detail.getByRole("img", { name: "court-light.png" }),
  ).toBeVisible();
  const reply = page.getByRole("region", { name: "Reply visible to member" });
  await expect(reply.getByText(state.reply, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/support-manager-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/support-manager-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Progress note", exact: true })
    .fill("An electrician will inspect the court today.");
  await page
    .getByRole("button", { name: "Update progress", exact: true })
    .click();
  await expect(
    reply.getByText("An electrician will inspect the court today.", {
      exact: true,
    }),
  ).toBeVisible();
  state.role = "MEMBER";
  await page.goto("/member/help");
  const history = page.getByRole("region", {
    name: "My requests",
    exact: true,
  });
  await expect(history.getByText("Facilities", { exact: true })).toBeVisible();
  await expect(history.getByText(message, { exact: true })).toBeVisible();
  await expect(history.getByText("In progress", { exact: true })).toBeVisible();
  await expect(
    history.getByText("Reply: An electrician will inspect the court today.", {
      exact: true,
    }),
  ).toBeVisible();
});

for (const action of ["done", "reject"] as const) {
  test(`manager ${action} refreshes a linked request and matches the member response`, async ({
    page,
  }) => {
    const { state, writes } = await install(page, true);
    await page.goto(`/manager/requests?type=support&request=${requestId}`);
    await page
      .getByRole("tab", {
        name: action === "done" ? "Mark as done" : "Reject",
        exact: true,
      })
      .click();
    const reply =
      action === "done"
        ? "The court light has been repaired."
        : "Please contact the equipment supplier.";
    await page
      .getByRole("textbox", {
        name: action === "done" ? "Resolution note" : "Rejection reason",
        exact: true,
      })
      .fill(reply);
    await page
      .getByRole("button", {
        name: action === "done" ? "Mark as done" : "Reject request",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: action === "done" ? "Confirm done" : "Confirm rejection",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Reply visible to member" })
        .getByText(reply, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Handle request" }),
    ).toHaveCount(0);
    expect(writes).toEqual([{ reason: reply }]);
    state.role = "MEMBER";
    await page.goto("/member/help");
    const history = page.getByRole("region", { name: "My requests" });
    await expect(
      history.getByText(`Reply: ${reply}`, { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByText(action === "done" ? "DONE" : "Rejected", {
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("manager records a member topic and message without requiring a subject", async ({
  page,
}) => {
  const { writes } = await install(page);
  await page.goto("/manager/requests?type=support");
  await page
    .getByRole("button", { name: "Record a request for member" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Member", exact: true })
    .fill("Member An");
  await dialog
    .getByRole("button", { name: /Member An.*an@example.com/ })
    .click();
  await dialog
    .getByRole("combobox", {
      name: "What is your request about? *",
      exact: true,
    })
    .selectOption("FACILITY");
  await expect(
    dialog.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("an@example.com");
  await expect(
    dialog.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("textbox", { name: /^Your message/ }).fill(message);
  await dialog
    .getByRole("button", { name: "Create & handle myself", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    memberId,
    category: "FACILITY",
    description: message,
  });
  expect(writes[0]).not.toHaveProperty("subject");
});

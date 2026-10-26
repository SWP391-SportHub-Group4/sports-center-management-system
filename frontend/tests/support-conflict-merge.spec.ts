import { expect, test, type Page } from "@playwright/test";

const memberId = "11111111-1111-4111-8111-111111111111";
const managerId = "33333333-3333-4333-8333-333333333333";
const receptionistId = "44444444-4444-4444-8444-444444444444";
const invoiceId = "55555555-5555-4555-8555-555555555555";
const itemId = "66666666-6666-4666-8666-666666666666";

async function install(page: Page, manager = true, activationPending = false) {
  const writes: Record<string, unknown>[] = [];
  const member = {
    userId: memberId,
    fullName: "Member An",
    email: "an@example.com",
    role: "MEMBER",
    status: "ACTIVE",
    sportIds: [],
    activationPending,
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "support-merge-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: manager ? managerId : receptionistId,
        role: manager ? "CENTER_MANAGER" : "RECEPTIONIST",
        fullName: manager ? "Manager" : "Receptionist",
        email: "staff@example.com",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/manager/requests/summary") return json({ support: 4 });
    if (path === "/api/member-support-requests/stats")
      return json({
        open: 0,
        assigned: 0,
        inProgress: 0,
        done: 4,
        rejected: 0,
      });
    if (path === "/api/member-support-requests/assignees")
      return json([
        { userId: managerId, name: "Manager", role: "CenterManager" },
        { userId: receptionistId, name: "Receptionist", role: "Receptionist" },
      ]);
    if (path === "/api/member-support-requests/queue")
      return json({ items: [], totalCount: 0, page: 1, pageSize: 20 });
    if (path === "/api/member-support-requests") {
      if (route.request().method() === "POST") {
        writes.push(route.request().postDataJSON());
        return json({ requestId: "created" });
      }
      return json(
        [1, 2, 3, 4].map((n) => ({
          requestId: `request-${n}`,
          subject: `Request ${n}`,
          category: "FACILITY",
          status: "CLOSED",
          createdAt: `2026-10-2${n}T02:00:00Z`,
        })),
      );
    }
    if (path === `/api/users/${memberId}`) return json(member);
    if (path === "/api/users")
      return json({ items: [member], totalCount: 1, page: 1, pageSize: 20 });
    if (path === "/api/invoices")
      return json({
        items: [{ invoiceId, invoiceNumber: "INV-ITEM", totalAmount: 100000 }],
        totalCount: 1,
      });
    if (path.endsWith("/refund-breakdown"))
      return json({
        items: [
          {
            invoiceItemId: itemId,
            description: "Gym day pass",
            totalVnd: 100000,
          },
        ],
      });
    return json([]);
  });
  return writes;
}

async function chooseMember(page: Page) {
  await page
    .getByRole("textbox", { name: /^(Member|Select Member)$/ })
    .fill("Member An");
  await page.getByRole("button", { name: /Member An.*an@example.com/ }).click();
}

for (const mode of ["manager", "queue", "handover"] as const) {
  test(`payment creation preserves invoice item and role rules: ${mode}`, async ({
    page,
  }) => {
    const manager = mode === "manager";
    const writes = await install(page, manager);
    await page.goto(
      manager ? "/manager/requests?type=support" : "/receptionist/support",
    );
    await page
      .getByRole("button", { name: "Record a request for member" })
      .click();
    await chooseMember(page);
    const dialog = page.getByRole("dialog");
    const category = dialog.getByRole("combobox", {
      name: manager ? "What is your request about? *" : "Request type",
      exact: true,
    });
    await category.selectOption("PAYMENT");
    await dialog
      .getByRole("textbox", {
        name: manager ? /^Your message/ : /^Description/,
      })
      .fill("Please refund the gym day pass.");
    const create = dialog.getByRole("button", {
      name: manager ? "Create & handle myself" : "Create for manager",
      exact: true,
    });
    await expect(create).toBeDisabled();
    await dialog
      .getByRole("combobox", { name: "Invoice", exact: true })
      .selectOption(invoiceId);
    await dialog
      .getByRole("combobox", { name: "Service requiring support" })
      .selectOption(itemId);
    await expect(create).toBeEnabled();
    // Switching away and back must not reuse an old invoice or service.
    await category.selectOption("FACILITY");
    await category.selectOption("PAYMENT");
    await expect(create).toBeDisabled();
    await dialog
      .getByRole("combobox", { name: "Invoice", exact: true })
      .selectOption(invoiceId);
    await dialog
      .getByRole("combobox", { name: "Service requiring support" })
      .selectOption(itemId);
    if (mode === "handover") {
      await dialog
        .getByRole("combobox", { name: "Hand over to (optional)" })
        .selectOption(managerId);
      const handover = dialog.getByRole("button", {
        name: "Create & hand over",
        exact: true,
      });
      await expect(handover).toBeDisabled();
      await dialog
        .getByRole("textbox", { name: "Handover note (required)" })
        .fill("Manager must process this refund.");
      await handover.click();
    } else await create.click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      memberId,
      category: "PAYMENT",
      invoiceId,
      invoiceItemId: itemId,
    });
    expect(writes[0]).not.toHaveProperty("subject");
    if (mode === "queue")
      expect(writes[0]).not.toHaveProperty("assigneeUserId");
    else expect(writes[0].assigneeUserId).toBe(managerId);
    if (mode === "queue")
      await expect(
        page.getByText("Request created for Center Manager.", { exact: true }),
      ).toBeVisible();
  });
}

test("manager member history prefills the shared form and keeps recent requests", async ({
  page,
}) => {
  const writes = await install(page);
  await page.goto("/manager/requests?type=support&record=1");
  await chooseMember(page);
  const history = page.getByRole("region", { name: "Member support" });
  await expect(history.getByText("Latest 3 of 4")).toBeVisible();
  await expect(history.getByText("Done", { exact: true })).toHaveCount(3);
  await expect(history.getByRole("link").first()).toHaveAttribute(
    "href",
    "/manager/requests?type=support&request=request-4",
  );
  await history
    .getByRole("button", { name: "Record a request for member" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("an@example.com");
  await expect(dialog.getByRole("textbox", { name: /Subject/ })).toHaveCount(0);
  await dialog
    .getByRole("combobox", {
      name: "What is your request about? *",
      exact: true,
    })
    .selectOption("FACILITY");
  await dialog
    .getByRole("textbox", { name: /^Your message/ })
    .fill("Please check the gym equipment.");
  await dialog
    .getByRole("button", { name: "Create & handle myself", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    memberId,
    category: "FACILITY",
    assigneeUserId: managerId,
  });
});

test("member pending activation cannot open the shared support form", async ({
  page,
}) => {
  await install(page, true, true);
  await page.goto("/manager/requests?type=support&record=1");
  await chooseMember(page);
  await expect(
    page
      .getByRole("region", { name: "Member support" })
      .getByRole("button", { name: "Record a request for member" }),
  ).toBeDisabled();
});

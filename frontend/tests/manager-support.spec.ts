import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  coachStaffId,
  installSupport,
  memberId,
  meId,
  otherStaffId,
  secondRequestId,
} from "./helpers/support";

const queue = "/manager/requests?type=support";

test("manager claims an unassigned request, updates progress and completes it", async ({
  page,
}, info) => {
  const { writes } = await installSupport(page);
  await page.goto(queue);
  const row = page.getByRole("button", { name: /Help with membership/ });
  await expect(row).toContainText("Unassigned");
  await expect(
    page.getByRole("link", { name: "View profile" }),
  ).toHaveAttribute("href", `/manager/members/${memberId}`);

  await page.getByRole("button", { name: "Assign to me" }).click();
  await expect(
    page.getByText("You are now handling this request."),
  ).toBeVisible();
  await expect(row).toContainText("Assigned");

  await page
    .getByRole("textbox", { name: "Progress note", exact: true })
    .fill("Checking the account");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(row).toContainText("In progress");

  await page.screenshot({
    path: info.outputPath("manager-support-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (x) => x.impact === "serious" || x.impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("tab", { name: "Mark as done" }).click();
  await page
    .getByRole("textbox", { name: "Resolution note", exact: true })
    .fill("Membership corrected");
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  expect(writes.some((write) => write.path.endsWith("/done"))).toBe(false);
  await page.getByRole("button", { name: "Confirm done" }).click();

  const final = page.getByRole("region", { name: "Final note" });
  await expect(final.getByText("Membership corrected")).toBeVisible();
  await expect(row).toContainText("Done");
  await expect(
    page.getByRole("region", { name: "Handle request" }),
  ).toHaveCount(0);
  expect(writes.map((x) => x.path.split("/").at(-1))).toEqual([
    "assign",
    "progress",
    "done",
  ]);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("manager rejects a request that was sent by mistake", async ({ page }) => {
  const { writes } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: meId,
  });
  await page.goto(queue);
  await page.getByRole("tab", { name: "Reject", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Rejection reason", exact: true })
    .fill("Wrong request, member was contacted.");
  await page.getByRole("button", { name: "Reject request" }).click();
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  const final = page.getByRole("region", { name: "Final note" });
  await expect(final.getByText("Rejection reason")).toBeVisible();
  await expect(
    final.getByText("Wrong request, member was contacted."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Help with membership/ }),
  ).toContainText("Rejected");
  expect(writes).toEqual([
    {
      path: expect.stringMatching(/\/reject$/),
      body: { reason: "Wrong request, member was contacted." },
    },
  ]);
});

test("only the assigned handler can act on a request", async ({ page }) => {
  const { writes } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: otherStaffId,
  });
  await page.goto(queue);
  const handler = page.getByRole("region", { name: "Current handler" });
  await expect(handler.getByText("Other handler")).toBeVisible();
  await expect(
    handler.getByText(/Only the assigned handler can update or transfer/),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Update progress" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Transfer request" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign to me" })).toHaveCount(
    0,
  );
  expect(writes).toEqual([]);
});

test("a request owned by someone who cannot act can be taken over", async ({
  page,
}) => {
  const { writes } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: otherStaffId,
    assigneeCanAct: false,
  });
  await page.goto(queue);
  await expect(
    page.getByRole("region", { name: "Current handler" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Assign this request to yourself before updating it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assign to me" }).click();
  await expect(
    page.getByText("You are now handling this request."),
  ).toBeVisible();
  expect(writes[0].body).toMatchObject({ assigneeUserId: meId });
});

test("the handler can hand a request over, including to a coach", async ({
  page,
}) => {
  const { writes } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: meId,
  });
  await page.goto(queue);
  const department = page.getByLabel("Department");
  await expect(department.locator("option")).toContainText([
    "Select a department",
    "Receptionist",
    "Coach",
    "Manager",
  ]);
  await department.selectOption({ label: "Coach" });
  await page.getByLabel("Staff member").selectOption(coachStaffId);
  await page.getByRole("button", { name: "Transfer request" }).click();
  await expect(page.getByText("Request transferred.")).toBeVisible();
  expect(writes[0].body).toMatchObject({ assigneeUserId: coachStaffId });
  // Once handed over the previous handler can no longer act on it.
  await expect(
    page.getByRole("region", { name: "Current handler" }),
  ).toBeVisible();
});

test("a rejected write keeps the draft and shows the server message", async ({
  page,
}) => {
  const { state } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: meId,
  });
  await page.goto(queue);
  const note = page.getByRole("textbox", {
    name: "Progress note",
    exact: true,
  });
  await note.fill("Do not lose this note");
  state.forbidWrites = true;
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Only the staff member assigned to this request" }),
  ).toBeVisible();
  await expect(note).toHaveValue("Do not lose this note");
});

test("manager filters on the server, pages, retries and sees empty results", async ({
  page,
}) => {
  const { queries, state } = await installSupport(page);
  await page.goto(queue);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get("page")).toBe("2");

  await page.getByLabel("Search", { exact: true }).fill(" Member An ");
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("search"))
    .toBe("Member An");
  expect(queries.at(-1)?.searchParams.get("page")).toBe("1");

  const stat = (name: string) =>
    page
      .getByRole("group", { name: "Filter by status" })
      .getByRole("button", { name: new RegExp(`^${name}`) });
  await stat("Assigned").click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("status"))
    .toBe("ASSIGNED");
  await expect(stat("Assigned")).toHaveAttribute("aria-pressed", "true");
  await stat("Unassigned").click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("status"))
    .toBe("OPEN");
  await stat("In progress").click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("status"))
    .toBe("IN_PROGRESS");
  await expect(
    page.getByRole("group", { name: "Filter by status" }).getByRole("button"),
  ).toHaveCount(6);

  await page
    .getByRole("combobox", { name: "Assigned staff", exact: true })
    .selectOption(meId);
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("assignedToUserId"))
    .toBe(meId);

  state.error = true;
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Support unavailable")).toBeVisible();
  state.error = false;
  state.empty = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No requests found")).toBeVisible();
});

test("selecting another request shows its own details", async ({ page }) => {
  await installSupport(page, { multiple: true });
  await page.goto(queue);
  await page.getByRole("button", { name: /Court booking question/ }).click();
  await expect(
    page.getByRole("button", { name: /Court booking question/ }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Member Binh").last()).toBeVisible();
  expect(secondRequestId).toBeTruthy();
});

test("manager records a request for a member with a required subject", async ({
  page,
}) => {
  const { writes } = await installSupport(page);
  await page.goto(queue);
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
  await dialog.getByLabel("Topic").selectOption("FACILITY");
  await dialog.getByLabel("Description").fill("Please check the court lights.");
  const create = dialog.getByRole("button", { name: "Create & handle myself" });
  await expect(create).toBeDisabled();
  await dialog.getByLabel("Subject").fill("Court light is broken");
  await expect(create).toBeEnabled();
  await create.click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].body).toMatchObject({
    memberId,
    category: "FACILITY",
    subject: "Court light is broken",
    description: "Please check the court lights.",
    assigneeUserId: meId,
  });
});

test("receptionist queue keeps member links in its own workspace and hides coaches", async ({
  page,
}) => {
  await installSupport(page, {
    role: "RECEPTIONIST",
    status: "ASSIGNED",
    assigned: meId,
  });
  await page.goto("/receptionist/support");
  await expect(
    page.getByRole("link", { name: "View profile" }),
  ).toHaveAttribute("href", `/receptionist/members/${memberId}`);
  await expect(page.locator('a[href^="/manager/"]')).toHaveCount(0);
  await expect(
    page.getByLabel("Department").locator("option", { hasText: "Coach" }),
  ).toHaveCount(0);
});

test("member cannot enter manager support", async ({ page }) => {
  const { writes } = await installSupport(page, { role: "MEMBER" });
  await page.goto("/manager/requests?type=support");
  await expect(page).toHaveURL(/\/member$/);
  await expect(page.getByRole("button", { name: "Assign to me" })).toHaveCount(
    0,
  );
  expect(writes).toEqual([]);
});

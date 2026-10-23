import { expect, test } from "@playwright/test";
import { installSupport, meId } from "./helpers/support";

const queue = "/manager/requests?type=support";

test("the member sees In progress with the staff reply after a progress update", async ({
  page,
}) => {
  const { state } = await installSupport(page, {
    status: "ASSIGNED",
    assigned: meId,
  });
  await page.goto(queue);
  await page
    .getByRole("textbox", { name: "Progress note", exact: true })
    .fill("An electrician will inspect the court today.");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Help with membership/ }),
  ).toContainText("In progress");

  state.role = "MEMBER";
  await page.goto("/member/help");
  const history = page.getByRole("region", {
    name: "My requests",
    exact: true,
  });
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
    const { state, writes } = await installSupport(page, {
      status: "ASSIGNED",
      assigned: meId,
    });
    await page.goto(`${queue}&request=22222222-2222-4222-8222-222222222222`);
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
      page.getByRole("region", { name: "Final note" }).getByText(reply),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Handle request" }),
    ).toHaveCount(0);
    expect(writes.map((x) => x.body)).toEqual([{ reason: reply }]);

    state.role = "MEMBER";
    await page.goto("/member/help");
    const history = page.getByRole("region", { name: "My requests" });
    await expect(
      history.getByText(`Reply: ${reply}`, { exact: true }),
    ).toBeVisible();
    await expect(
      history.getByText(action === "done" ? "Done" : "Rejected", {
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("a new request shows as Unassigned to the member until someone takes it", async ({
  page,
}) => {
  const { state } = await installSupport(page, { role: "MEMBER" });
  await page.goto("/member/help");
  const history = page.getByRole("region", { name: "My requests" });
  await expect(history.getByText("Unassigned", { exact: true })).toBeVisible();
  state.status = "ASSIGNED";
  state.assigned = meId;
  await page.reload();
  await expect(history.getByText("Assigned", { exact: true })).toBeVisible();
});

test("a member must enter a subject before sending a request", async ({
  page,
}) => {
  await installSupport(page, { role: "MEMBER" });
  let sent = "";
  await page.route("**/api/support/requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sent = route.request().postData() ?? "";
    return route.fulfill({ json: { reference: "ABCDEF12" } });
  });
  await page.goto("/member/help");
  await page
    .getByLabel("What is your request about? *")
    .selectOption("FACILITY");
  await page
    .getByRole("textbox", { name: "Your message *" })
    .fill("The basketball court light is broken.");
  await page.getByRole("checkbox").check();
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole("textbox", { name: "Subject *" }).fill("Court light");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText("Request received")).toBeVisible();
  expect(sent).toContain('name="subject"');
  expect(sent).toContain("Court light");
});

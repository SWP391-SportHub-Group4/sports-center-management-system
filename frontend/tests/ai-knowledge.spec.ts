import { expect, test } from "@playwright/test";
import { installPromptApi } from "./helpers/system-prompts";

test("list loads the two server prompts and filters by audience", async ({
  page,
}) => {
  await installPromptApi(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "sporthub.system-prompts.demo.v2.manager-test",
      JSON.stringify([{ title: "Old browser-only prompt" }]),
    ),
  );
  await page.goto("/manager/ai-knowledge");
  await expect(page.getByRole("table").getByRole("link")).toHaveText([
    "Coach system prompt",
    "Member system prompt",
  ]);
  await expect(
    page.getByText("Live system prompts", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Old browser-only prompt")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Add content", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Filter by audience").selectOption("Member");
  await expect(page.getByRole("table").getByRole("link")).toHaveText([
    "Member system prompt",
  ]);
});

test("save draft preserves live content; Publish persists centrally across reload", async ({
  page,
}) => {
  const state = await installPromptApi(page);
  const original = state.rows.find((a) => a.id === "member-system-prompt")!
    .active!.content;
  await page.goto("/manager/ai-knowledge/member-system-prompt");
  await expect(page.getByLabel("Audience", { exact: true })).toBeDisabled();
  await page.getByLabel(/^Content/).fill("The new live member prompt");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved to the server",
  );
  expect(
    state.rows.find((a) => a.id === "member-system-prompt")!.active!.content,
  ).toBe(original);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "live chatbot will use this version",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("next chat message");
  expect(state.writes.map((w) => w.operation)).toEqual(["draft", "publish"]);
  expect(state.writes[1].body.expectedRevision).toBe(2);
  expect(
    state.rows.find((a) => a.id === "member-system-prompt")!.active!.content,
  ).toBe("The new live member prompt");
  await page.reload();
  await expect(page.getByLabel(/^Content/)).toHaveValue(
    "The new live member prompt",
  );
  await expect(page.getByLabel("Effective date")).toHaveCount(0);
  await expect(page.getByLabel("Change note")).toHaveCount(0);
});

test("failed writes and stale revisions preserve edits instead of overwriting publication", async ({
  page,
}) => {
  const state = await installPromptApi(page);
  await page.goto("/manager/ai-knowledge/member-system-prompt");
  await page.getByLabel(/^Content/).fill("Keep these unsaved edits");
  state.fail = true;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Server unavailable" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Content/)).toHaveValue(
    "Keep these unsaved edits",
  );
  state.fail = false;
  state.rows.find((a) => a.id === "member-system-prompt")!.revision++;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Another manager" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Content/)).toHaveValue(
    "Keep these unsaved edits",
  );
  expect(state.writes).toHaveLength(0);
});

test("earlier browser-only edits can be loaded for review without automatic publication", async ({
  page,
}) => {
  const state = await installPromptApi(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "sporthub.system-prompts.demo.v2.manager-test",
      JSON.stringify([
        {
          id: "member-system-prompt",
          draft: {
            title: "Earlier draft",
            audience: "Member",
            category: "General",
            content: "Earlier browser-only content",
          },
        },
      ]),
    ),
  );
  await page.goto("/manager/ai-knowledge/member-system-prompt");
  await expect(
    page.getByRole("button", {
      name: "Load previous browser version",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Content/)).not.toHaveValue(
    "Earlier browser-only content",
  );
  await page
    .getByRole("button", { name: "Load previous browser version", exact: true })
    .click();
  await expect(page.getByLabel(/^Content/)).toHaveValue(
    "Earlier browser-only content",
  );
  expect(state.writes).toHaveLength(0);
});

test("restore publishes a historical version while deletion confirms fallback", async ({
  page,
}) => {
  const state = await installPromptApi(page);
  const original = state.rows.find((a) => a.id === "coach-system-prompt")!
    .active!.content;
  await page.goto("/manager/ai-knowledge/coach-system-prompt");
  await page.getByLabel(/^Content/).fill("Temporary coach prompt");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page.getByRole("button", { name: /^Version 1 / }).click();
  await page
    .getByRole("button", { name: "Restore version 1", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    state.rows.find((a) => a.id === "coach-system-prompt")!.active!.content,
  ).toBe(original);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Coach system prompt" });
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "built-in default prompt",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await expect(row).toBeVisible();
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
});

test("missing role can be recreated and edits do not change creation order", async ({
  page,
}) => {
  const state = await installPromptApi(page);
  state.rows = state.rows.filter((a) => a.id !== "member-system-prompt");
  await page.goto("/manager/ai-knowledge");
  await page.getByRole("link", { name: "Add content", exact: true }).click();
  await expect(page.getByLabel("Audience", { exact: true })).toHaveValue(
    "Member",
  );
  await page.getByLabel("Title", { exact: false }).fill("Member system prompt");
  await page.getByLabel(/^Content/).fill("Recreated member prompt");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/member-system-prompt$/);
  expect(state.writes[0].body.expectedRevision).toBe(0);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page.getByRole("table").getByRole("link")).toHaveText([
    "Member system prompt",
    "Coach system prompt",
  ]);
  await page
    .getByRole("link", { name: "Coach system prompt", exact: true })
    .click();
  await page.getByLabel("Title", { exact: false }).fill("Edited coach prompt");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved to the server",
  );
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page.getByRole("table").getByRole("link")).toHaveText([
    "Member system prompt",
    "Edited coach prompt",
  ]);
});

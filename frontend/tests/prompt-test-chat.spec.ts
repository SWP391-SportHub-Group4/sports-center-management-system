import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { installPromptApi } from "./helpers/system-prompts";
const install = installPromptApi;
type Request = {
  role: "Member" | "Coach";
  question: string;
  systemPrompt: string;
  conversationId: string | null;
};
const response = (request: Request) => ({
  conversationId: `${request.role}-conversation`,
  role: request.role,
  answer: `Demo ${request.role} reply to ${request.question}`,
  provider: "Test provider",
  model: "test-model",
  responseTimeMs: 120,
  contextSources: [`Demo ${request.role} schedule`],
});

test("role conversations are separate; follow-ups and changed drafts use the right prompt", async ({
  page,
}) => {
  await install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests: Request[] = [];
  await page.route("**/api/ai/prompts/test-chat", (route) => {
    const request = route.request().postDataJSON() as Request;
    requests.push(request);
    return route.fulfill({ json: response(request) });
  });
  await page.goto("/manager/ai-knowledge/coach-system-prompt");
  await page.getByLabel(/^Content/).fill("A coach prompt being edited");
  await page.getByRole("button", { name: "Test with AI", exact: true }).click();
  const chat = page.getByRole("dialog", { name: "Prompt test chat" });
  await expect(
    chat.getByRole("button", { name: "Coach", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(chat).toContainText("Unsaved draft");
  await chat.getByLabel("Message", { exact: true }).fill("Hello coach");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByText("Demo Coach reply to Hello coach", { exact: true }),
  ).toBeVisible();
  expect(requests[0].systemPrompt).toBe("A coach prompt being edited");
  expect(requests[0].conversationId).toBeNull();
  await chat
    .getByLabel("Message", { exact: true })
    .fill("What about tomorrow?");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByText("Demo Coach reply to What about tomorrow?", { exact: true }),
  ).toBeVisible();
  expect(requests[1].conversationId).toBe("Coach-conversation");
  await chat.getByRole("button", { name: "Member", exact: true }).click();
  await expect(chat).toContainText("Published prompt");
  await expect(
    chat.getByText("Demo Coach reply to Hello coach", { exact: true }),
  ).toHaveCount(0);
  await chat.getByLabel("Message", { exact: true }).fill("Hello member");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByText("Demo Member reply to Hello member", { exact: true }),
  ).toBeVisible();
  expect(requests[2].role).toBe("Member");
  expect(requests[2].systemPrompt).toContain(
    "You are the SportHub AI Assistant.",
  );
  expect(requests[2].conversationId).toBeNull();
  await chat.getByRole("button", { name: "Coach", exact: true }).click();
  await expect(
    chat.getByText("Demo Coach reply to Hello coach", { exact: true }),
  ).toBeVisible();
  await page.getByLabel(/^Content/).fill("Changed coach prompt");
  await expect(chat).toContainText("Prompt changed");
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await chat
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await chat.getByLabel("Message", { exact: true }).fill("Try changed prompt");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByText("Demo Coach reply to Try changed prompt", { exact: true }),
  ).toBeVisible();
  expect(requests[3].systemPrompt).toBe("Changed coach prompt");
  expect(requests[3].conversationId).toBeNull();
  const dir = path.resolve(".impeccable/review");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, "test-chat-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: path.join(dir, "test-chat-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
});

test("failed replies can retry and changing roles cancels a pending reply", async ({
  page,
}) => {
  await install(page);
  let fail = true;
  let release: (() => void) | undefined;
  await page.route("**/api/ai/prompts/test-chat", async (route) => {
    const request = route.request().postDataJSON() as Request;
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 502,
        json: {
          error: "prompt_test_provider_failed",
          message: "Provider unavailable",
        },
      });
    }
    if (request.question === "Slow question")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({ json: response(request) }).catch(() => {});
  });
  await page.goto("/manager/ai-knowledge/member-system-prompt");
  await page.getByRole("button", { name: "Test with AI", exact: true }).click();
  const chat = page.getByRole("dialog", { name: "Prompt test chat" });
  await chat.getByLabel("Message", { exact: true }).fill("Retry question");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("alert")).toContainText("Provider unavailable");
  await chat
    .getByRole("button", { name: "Retry message", exact: true })
    .click();
  await expect(
    chat.getByText("Demo Member reply to Retry question", { exact: true }),
  ).toBeVisible();
  await expect(chat.getByText("Retry question", { exact: true })).toHaveCount(
    1,
  );
  await chat.getByLabel("Message", { exact: true }).fill("Slow question");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => !!release).toBe(true);
  await chat.getByRole("button", { name: "Coach", exact: true }).click();
  release!();
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toHaveText("Send");
  await expect(
    chat.getByText("Demo Member reply to Slow question", { exact: true }),
  ).toHaveCount(0);
  await chat.getByRole("button", { name: "Member", exact: true }).click();
  await expect(
    chat.getByText("Demo Member reply to Retry question", { exact: true }),
  ).toBeVisible();
});

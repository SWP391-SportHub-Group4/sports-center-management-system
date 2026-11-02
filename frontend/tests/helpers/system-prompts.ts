import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type {
  Article,
  Content,
  Revision,
} from "../../src/features/ai-knowledge/service";

export function initialPrompts(): Article[] {
  return (["Coach", "Member"] as const).map((role, index) => {
    const file =
      role === "Coach"
        ? "CoachAiSystemPrompt.cs"
        : "SportHubAssistantSystemPrompt.cs";
    const source = fs.readFileSync(
      path.resolve("../backend/SportHub.AI/Prompts/" + file),
      "utf8",
    );
    const content = source
      .match(
        /public const string Content\s*=\s*"""\r?\n([\s\S]*?)\r?\n""";/,
      )![1]
      .replace(/\r\n/g, "\n");
    const revision: Revision = {
      title: `${role} system prompt`,
      audience: role,
      category: "General",
      content,
      version: 1,
      savedAt: `2026-11-0${2 - index}T00:00:00Z`,
      author: "System default",
      action: "Initial",
    };
    return {
      id: `${role.toLowerCase()}-system-prompt`,
      revision: 1,
      active: revision,
      draft: null,
      history: [],
      createdAt: revision.savedAt,
      updatedAt: revision.savedAt,
      sourceVersion: `managed-${role.toLowerCase()}-v1`,
      sourceFile: file,
    };
  });
}

export async function installPromptApi(page: Page) {
  const state = {
    rows: initialPrompts(),
    writes: [] as {
      operation: string;
      id: string;
      body: Record<string, unknown>;
    }[],
    fail: false,
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "prompt-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "manager-test",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        },
      });
    if (pathname === "/api/ai/system-prompts/current")
      return route.fulfill({
        json: Object.fromEntries(
          ["Member", "Coach"].map((role) => {
            const row =
              state.rows.find(
                (a) => a.id === `${role.toLowerCase()}-system-prompt`,
              ) ??
              initialPrompts().find(
                (a) => a.id === `${role.toLowerCase()}-system-prompt`,
              )!;
            return [
              role,
              { content: row.active!.content, version: row.sourceVersion },
            ];
          }),
        ),
      });
    if (pathname === "/api/ai/system-prompts")
      return route.fulfill({ json: state.rows });
    const match = pathname.match(
      /^\/api\/ai\/system-prompts\/([^/]+)(?:\/(draft|publish|restore))?$/,
    );
    if (match) {
      const [, id, operation] = match;
      const row = state.rows.find((a) => a.id === id);
      const body =
        request.method() === "DELETE"
          ? {
              expectedRevision: Number(
                url.searchParams.get("expectedRevision"),
              ),
            }
          : (request.postDataJSON() as Record<string, unknown>);
      if (state.fail)
        return route.fulfill({
          status: 503,
          json: {
            error: "save_failed",
            message: "Server unavailable. Retry your changes.",
          },
        });
      if ((row?.revision ?? 0) !== body.expectedRevision)
        return route.fulfill({
          status: 409,
          json: {
            error: "system_prompt_conflict",
            message:
              "Another manager changed this prompt. Reload the latest version.",
          },
        });
      state.writes.push({ operation: operation ?? "delete", id, body });
      if (request.method() === "DELETE") {
        state.rows = state.rows.filter((a) => a.id !== id);
        return route.fulfill({ status: 204 });
      }
      const source =
        operation === "restore"
          ? row!.history.find((r) => r.version === body.version)!
          : (body as Content);
      const version = (row?.revision ?? 0) + 1;
      const revision: Revision = {
        title: source.title,
        audience: source.audience,
        category: source.category,
        content: source.content,
        version,
        author: "Center Manager",
        savedAt: new Date().toISOString(),
        action: operation,
      };
      const saved: Article = {
        id,
        revision: version,
        active: operation === "draft" ? row?.active : revision,
        draft:
          operation === "draft"
            ? revision
            : operation === "restore"
              ? row?.draft
              : null,
        history:
          operation === "draft"
            ? (row?.history ?? [])
            : row?.active
              ? [row.active]
              : [],
        createdAt: row?.createdAt ?? revision.savedAt,
        updatedAt: revision.savedAt,
        sourceVersion:
          operation === "draft"
            ? (row?.sourceVersion ?? "built-in")
            : `managed-${source.audience.toLowerCase()}-v${version}`,
        sourceFile: row?.sourceFile ?? "",
      };
      state.rows = [...state.rows.filter((a) => a.id !== id), saved];
      return route.fulfill({ json: saved });
    }
    return route.fulfill({
      json: pathname.endsWith("unread-count") ? { count: 0 } : [],
    });
  });
  return state;
}

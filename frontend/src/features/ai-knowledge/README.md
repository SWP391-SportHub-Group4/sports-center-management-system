# Managed system prompts

The Center Manager avatar menu opens /manager/ai-knowledge. The two canonical IDs are member-system-prompt and coach-system-prompt. Each role has at most one managed prompt; its audience is fixed. A deleted role can be recreated. The UI, drafts, publication and history use authenticated backend APIs, not browser storage.

## Publication

Save draft stores a server-side draft without changing the live assistant. Publish sends the exact editor content, persists it atomically and clears its saved draft. The next chat request that starts after publication commits reads that active content from PostgreSQL. An already running reply may complete with the prompt it started with. No rebuild or container restart is required for later publications.

SystemPromptService implements ISystemPromptReader without caching. AiChatService resolves the active prompt on every request, applies the existing Member language helper and preserves plain-text sanitization. Active version is recorded in AiLog and included in the access-scope fingerprint, so old continuations cannot carry a previous prompt into the new publication.

Migration ManagedSystemPrompts adds ai_system_prompts and seeds the two initial code prompts. Each row stores active/draft content, at most one previous published snapshot with actor/version/action/time, and an optimistic concurrency revision. A stale expectedRevision returns 409 without overwriting newer data. Save draft does not add history. Publish replaces history with the previously active snapshot and drops older publications. Restore swaps the previous publication back into active content under a new revision, keeps the previously active content as the sole history entry and preserves saved drafts. Delete removes the managed row and history; the live assistant then falls back to its original C# prompt. Later builds never overwrite manager publications.

Earlier browser-only edits remain untouched. When found for a role, an explicit Load previous browser version action copies them into the editor for review. They are never automatically published.

## API

All management endpoints require CenterManager:

- GET /api/ai/system-prompts
- GET /api/ai/system-prompts/current
- PUT /api/ai/system-prompts/{id}/draft
- POST /api/ai/system-prompts/{id}/publish
- POST /api/ai/system-prompts/{id}/restore
- DELETE /api/ai/system-prompts/{id}?expectedRevision=N

Save/publish bodies carry title, audience, category, content and expectedRevision. Restore carries version and expectedRevision. The actor is derived from authenticated claims. Built-in defaults remain in SportHubAssistantSystemPrompt.cs and CoachAiSystemPrompt.cs; frontend builds no longer copy these files.

## Test chat

POST /api/ai/prompts/test-chat calls the existing Python IAiChatProvider with synthetic Member/Coach fixtures only. A supplied draft is tested as-is; if no prompt is supplied, the backend resolves the current publication. Test chat never publishes or changes real business records. Its in-memory session is bound to Manager ID, role and prompt fingerprint, expires after 30 minutes and is not shared across backend replicas. Each session permits at most 20 completed turns; subsequent requests are rejected when existing history exceeds 24,000 characters. Questions are limited to 2,000 characters, prompts to 30,000 and replies to 16,000. Only successful turns are appended. The endpoint has a per-manager rate limit of 20 requests/minute.

Member and Coach conversations are separate. Role switches cancel pending UI requests; changed prompt content requires a new conversation. Unsaved editor content, the counterpart's saved draft, and published content are identified explicitly. Shared Drawer and message styles are reused; desktop remains nonmodal and mobile is fullscreen. Responses remain plain text. Python AI must run with its existing Gemini configuration.

## Deployment and verification

Apply the new migration before deploying the updated backend, then update frontend code/image once. docker compose build backend frontend builds the images; docker compose run --rm --no-deps --entrypoint /app/migrate backend applies the bundled migration. Later publications need only API/database writes.

ManagedSystemPromptTests uses isolated PostgreSQL and the real API/chat service with a recording AI provider: draft isolation, publication into the next provider request, cross-manager visibility, role separation, stale revision rejection, concurrent publication, restore and deletion fallback. PromptTestChatServiceTests and SportHubAssistantSystemPromptTests cover sandbox isolation and language behavior. Browser tests mock the API contract and cover publication, persisted reloads, errors, stale edits, legacy draft review, restore/delete and role chat behavior. They do not establish external Gemini answer quality.

## History retention

KeepPreviousPublishedPrompt trims existing history to the most recent publication before the active version, excluding draft snapshots and the active version itself. It leaves active and draft payloads untouched and enforces a database check limiting history arrays to one entry. Older discarded versions cannot be restored. The initial prompt has empty history until its first replacement.

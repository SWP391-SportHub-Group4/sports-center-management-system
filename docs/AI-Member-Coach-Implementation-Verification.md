# SportHub — AI Member/Coach: Implementation & Verification

Updated: 2026-11-02. Scope: Flow 5 Coach AI suggestion and Flow 6 chatbot navigation for Member/Coach only.

## Evidence and limitations

- Based on the available repository ZIP `(9)`, AI patch ZIPs, and the latest supplied `AiChatService(3).cs` conflict file.
- Repository ZIP is a **snapshot**, not the GitHub HEAD after rebase. Do not overwrite a teammate's newer documentation without reviewing diffs.
- The current merged `AiChatService.cs` uses `ISystemPromptReader` for a published prompt, and the assistant should not revert to static prompt selection.
- No successful CI/E2E run against the final rebase HEAD is available in these inputs; the following are **acceptance criteria**, not certified pass results.

## Role scope

Member: chat and navigation about Member UI, own services, invoices, wallet, schedule, AI workouts and account. Coach: class/schedule, students, attendance, lesson plans, account and coaching context. Neither role is allowed to execute or receive impersonated staff-only workflows. Manager, Receptionist, Admin are not AI chat UI roles.

## Training Goal policy

- Basic input: trim, normalize Unicode, verify nonempty, bounded length; document exact configured length threshold. A hard minimum of 12 characters rejects some meaningful short Vietnamese input and should be revised/explicitly accepted as a product rule.
- Semantic verdicts: VALID, VAGUE, INVALID. VAGUE may proceed with normalized training goal using sport/level/context. INVALID gets an explanation, does not call generation. Provider failure/invalid JSON must fail closed without an invented plan.
- Cases: ``tập kỹ thuật`` (VAGUE), ``cải thiện thể lực`` (VAGUE), ``tap ky thuat`` (VAGUE), ``Improve beginner footwork`` (VALID), ``dwadawdawdawdawdawd`` (INVALID), ``học SQL`` (INVALID), unrealistic height guarantee (INVALID or correction request), pain/medical risk (clarify or safe limitation), mixed language, Unicode combining accents, prompt injection and long text.
- Output: structured items must have legal sets/reps and not contain implausible claims; Coach reviews and saves explicitly.

## Navigation knowledge requirements

1. Enumerate Member/Coach pages, tabs, buttons, route patterns and visible labels from the frontend.
2. Trace each actionable UI control to handler and API when applicable; do not equate API endpoint with button.
3. Record owner role, feature ID, button label, preconditions, step sequence, backend route and source file.
4. For verified workflow, answer in Vietnamese or English based on question; keep UI button labels in English.
5. For unmatched navigation, admit unavailable verified instructions, do not make up exact clicks; off-topic guard must not reject normal navigation questions.

## CI and merge checks

```powershell
git status
git diff --check
dotnet build .\backend\SportHub.sln --configuration Release
cd frontend
pnpm exec tsc --noEmit
pnpm build
```

During rebase, ensure `AiChatService` contains only one role extraction and one definition of `isCoach`, `systemPrompt`, `promptVersion`. Preserve published prompt reader and access-scope fingerprint. Finish rebase before pushing.

## Acceptance matrix

| Scenario | Expected |
|---|---|
| Coach asks in Vietnamese where Personal Plan button is | Coach path with verified UI labels; no off-topic refusal |
| Member asks where invoices are | Member-only verified route and steps |
| Member asks for Coach-only action | No instruction to use Coach-only page as Member |
| Coach asks account management | Shared `/account` route, no invented menu steps |
| Broad relevant Goal | VAGUE → suggestion, not 400 just for broadness |
| Nonsense Goal | INVALID → explanation, no suggestion |
| Goal unrelated to selected sport | Reject or clarify; no misrepresented sport plan |
| Provider timeout or malformed verdict | No generation; distinguish provider failure from user-invalid input |
| Prompt version changed | Previous interaction continuation revalidated |
| User asks outside center scope | Polite scoped response, avoiding false off-topic classification for UI questions |

## Documentation sync policy

The appended addenda amend historical text without deleting audit trail. Before merging the docs, compare them to `origin/feat/hao-ai-flow5-flow6` or current target HEAD; do not blindly overwrite newer docs from team members. Update `api-contract.md` from running OpenAPI when semantics and schemas are finalized. Prior claim of 100% coverage is not supported.

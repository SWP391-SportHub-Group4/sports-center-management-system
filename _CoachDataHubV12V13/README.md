# SportHub Coach Data Hub v12 + Intent Orchestrator v13

## Purpose

Consolidate Coach analytical evidence retrieval in `CoachDataHub.cs` and retain a single
Coach-only analytics entrypoint (`CoachIntentOrchestrator.TryAnswerAsync`) from v10.
Replace **only** `CoachIntentOrchestrator.cs` and add `CoachDataHub.cs`. Existing v11
Coach metrics, deterministic Coach handlers and UI knowledge are preserved.

This is a compatibility patch for an already installed v10 + v11 checkout.
It does **not** replace the AI Plan, Member Chatbox, the Manager published prompts,
frontend files, database schema, or `AiChatService.cs`.

## Installation (PowerShell from repo root)

Extract ZIP to `_CoachDataHubV12V13` under the repo root.
The install script uses files from the extraction folder; **do not manually copy** the
C# files first.

```powershell
python .\_CoachDataHubV12V13\tools\install_coach_datahub_v12_v13.py --repo .
# Only after DRY RUN PASS:
python .\_CoachDataHubV12V13\tools\install_coach_datahub_v12_v13.py --repo . --apply
python .\_CoachDataHubV12V13\tests\verify_package.py

dotnet build .\backend\SportHub.AI\SportHub.AI.csproj -c Release
if ($LASTEXITCODE -ne 0) { throw "AI Build failed" }
dotnet build .\backend\SportHub.sln -c Release
if ($LASTEXITCODE -ne 0) { throw "Solution Build failed" }
```

If the dry-run fails, do not bypass its checks. Provide the current two Coach source files
and the exact error. Do **not** rerun the v10/v11 installers after this patch.

## What it does

- V12 hub: bounded read-only Coach evidence for Classes, Students, Schedule,
  Requests, Notifications, Overview. Data is queried at request time with actual
  authenticated Coach membership scope.
- V13: route descriptive/numeric queries to existing handlers, direct comparison,
  priority and causal questions to Gemini with Coach-only evidence, and BMI / height /
  weight / training-day comparisons to v11 deterministic arithmetic.
- Manager's published Coach prompt is read by the orchestrator before Gemini calls.
- Gemini does **not** receive SQL credentials or issue arbitrary SQL.

## Known limits / required acceptance tests

- No live database validation here. Run build and verify with the Railway Coach login.
- Strict role scoping, returned record limits, and source evidence are not equivalent
  to full coverage of all Coach APIs.
- The existing v10 entrypoint does not receive validated multi-turn entity history;
  references such as "the third one" remain ambiguous without a verified
  conversation-entity store.
- Coach profile/health data should not be included in broad LLM evidence; v11
  returns selected numeric metrics after enrollment-based permission checks.
- The old deterministic handlers must already be installed and functional.
- The backend may still fail if Gemini or the database is unavailable. Do not
  present a 502 as a misunderstanding of the user.

See `tests/acceptance_matrix.csv` for runtime/authorization acceptance scenarios.

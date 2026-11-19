# SportHub Coach AI Plan V2

## Scope
Upgrade from installed Coach Plan V1 (including the previously corrected unit test). Preserve original V37 exactly. Only 12 allowlisted Coach files: 5 replacements, 6 removals, 1 new generator. V1 teaching-api.ts remains unchanged (keeps SessionId). No change to config, API keys, Python shared service/Model Router, member code, database schema or manual save. Stop backend and frontend first.

Session/Personal share CoachPlanGenerator. It sends exactly sport, trainingGoal and experience (coach entered); language is in the question. No member profile or class/session ID, history, roster, body metrics, schedule duration. Review receives same JSON plus draft. No automatic persistence. Retain assigned coach, active enrollment, scope and upcoming session checks before and after generation. The UI no longer prefills student goal/level. No requirement for duration or schedule; optional practical holds/intervals in exercises. Human coach edits and saves. AI cannot guarantee medical safety or accurate professional coaching. Avoid entering sensitive student data into free text, which is sent to Gemini verbatim (trimmed).

Generation combines semantic assessment and draft into one JSON response; valid draft requires 4–10 lines each with positive sets/reps and independent model review. Refusals have a nonempty reason and empty content, map to training_goal_invalid (400). Review reject maps to ai_suggestion_requires_review (400); invalid structured output maps to 502. No automatic repair. Normal path 2 provider calls, semantic rejects 1, deterministic rejects 0. Provider retries and fallback may increase upstream requests; runner cap counts provider calls, not actual Gemini requests. Review is model-based, not a proof of correctness. Shared Python provider may report configured rather than actual fallback model; V2 does not modify that behavior. Existing provider's quotas remain shared across features.

## Install
From repository root in PowerShell:
```
Expand-Archive "$env:USERPROFILE\Downloads\SportHub_Coach_AI_Plan_V2.zip" -DestinationPath . -Force
python .\coach-plan-v2\install_v2.py --root . --check
python .\coach-plan-v2\install_v2.py --root .
dotnet build .\backend\SportHub.API\SportHub.API.csproj -c Release
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter "FullyQualifiedName~CoachPlanContextTests"
```
Require CHECK_OK before install. Installer accepts original V1 and its fixed unit test revision; unknown edits cause refusal, not forced overwrite. Keep BACKUP_ID. Restart backend and frontend after install. Python unchanged; if stopped, start your existing configured Python service.

## Live suite – no ClassId, JWT, MemberId or database
Use local Python AI Service configured with sporthub-2 key and Gemini model; actual production generator and PythonCoachPlanProvider are referenced. Do not provide any student information or secrets. This is a generator-level test, not controller/UI integration. Start Python service in separate terminal (from ai-service, activate existing venv then `python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`). From repo root:
```
dotnet run --project .\coach-plan-v2\live-tests\CoachPlan.LiveTests.csproj -c Release -- --group local
dotnet run --project .\coach-plan-v2\live-tests\CoachPlan.LiveTests.csproj -c Release -- --id CPV2-001 --max-calls 2
dotnet run --project .\coach-plan-v2\live-tests\CoachPlan.LiveTests.csproj -c Release -- --group all --max-calls 100
```
Other flags: `--group happy`, `--group unhappy`, `--max-cases 5`, `--python-url http://127.0.0.1:8001` (loopback only). 24 happy cases, 26 unhappy (16 local guards, 10 semantic). Estimated 58 provider calls maximum on expected path (48 + 10), not an actual Gemini quota forecast. If a semantic case is rejected locally, acceptance is still valid; local fixtures must make zero calls. If a negative case generates a draft and review rejects, runner flags FAIL because expected training_goal_invalid is not returned. If local validation/regression guards reject a happy case, runner flags FAIL. No external judge; inspect raw draft/review and check sport-specific quality. Report directory printed at end, contains HTML, JSON, JUnit XML; raw synthetic generation/review answers and context logged. INFRA_ERROR separately from FAIL. Budget exhaustion NOT_RUN; on rate limit stop further live calls but still run local cases. Exit 0 all pass, 1 any fail, 2 otherwise. Do not commit reports. Provider timeout/retries are existing shared configuration. No real Google calls were performed during package creation.

## Integration
With disposable PostgreSQL fixture and Docker only (never production DB):
```
Remove-Item Env:SPORTHUB_TEST_POSTGRES -ErrorAction SilentlyContinue
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter 'FullyQualifiedName~CoachPlanContextIntegrationTests|FullyQualifiedName~Ai_suggestions_require_a_specific_upcoming_session'
```
Integration uses synthetic records + provider HTTP stub, asserts identical three-field context for session/personal, verifies no profile data and no database writes, and asserts invalid scope/past session/outsider rejections. Separate UI smoke test: both scopes, coach can generate then edit, no auto-save; past/current session has no suggestions. Existing V1 50 API tests are superseded for live generator testing; do not rerun without revalidating their expectations.

## Rollback
Stop backend/frontend. `python .\coach-plan-v2\install_v2.py --root . --rollback BACKUP_ID` (replace with actual ID). Conflicting revisions are rejected. Backup includes removed V1 builders/tests. Do not run old V1 installer or mix with V2. No change to V37.

## Verification
Installer dry run/install/idempotence/rollback/conflict tested against V1 fixture with actual original V37 payload and fixed test file; V37 bytes unchanged. TypeScript transpile diagnostics 0. No .NET SDK in creation environment: C# compilation, unit tests, integration, live Gemini tests NOT RUN. Candidate patch, not production verified. Existing AIPlanGoalGuard retained unchanged; its heuristic regex may still reject legitimate text or miss invalid text, semantic review is supplementary. No actual token count measured.

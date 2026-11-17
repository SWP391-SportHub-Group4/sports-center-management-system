# SportHub Coach AI Plan V1 — 50 API test cases

## Scope
Independent test-only package. No change to V37 Member AI Suggestions, production files, prompts, router, database, `.env`, or dependencies. Extract into the repository root; all included files live under `coach-plan-tests/`. The included corrected C# unit file is a copy, not auto-installed. The runner calls the existing localhost POST `/api/coaches/me/teaching/classes/{classId}/suggestion` using a Coach JWT and the actual application configuration (Python `/coach/plan` -> Gemini). It neither invokes member endpoints nor sends a direct Gemini request. No automatic plan save or fixture creation. The app itself must be configured for a real Gemini model; the runner cannot independently prove actual provider use from the response label alone.

Baseline audited: `SportHub_Coach_AI_Plan_V1.zip`, original `sports-center-management-system-feat-hao-ai-flow5-flow6(2).zip`, and corrected `CoachPlanContextTests.cs`. `verify_source.py` compares hashes (CRLF normalized) against the V1 files and original V37 member generator, including the corrected test. It is a read-only check of files on disk, not proof that the running application was built from them. A different hash could represent a legitimate local change; inspect before proceeding, do not overwrite production source.

## Test inventory

| IDs | Group | Number |
|---|---|---:|
| CP-001–020 | Local validation (scope, level, goal, injection, etc.) | 20 |
| CP-021–030 | Session and authorization scope | 10 |
| CP-031–036 | Semantic rejection, including unsafe/impossible/mixed objectives | 6 |
| CP-037–044 | Session Plan happy cases | 8 |
| CP-045–050 | Personal Plan happy cases | 6 |

The suite defaults to Badminton fixtures since the goals are sport-specific. Other sports need their own goals and expectations, not a blind substitution. Test design assumes the valid student is enrolled, the class is assigned to the coach (main coach), the future session has sufficient time and is Scheduled with positive duration, and no deliberately unresolved severe contraindications among the default happy-case fixtures. For useful context tests seed synthetic assessment records for completed sessions, attendance, a mix of beginner/intermediate/advanced levels, and safe restrictions such as no jumping. Positive output can vary. Coach manually reviews each draft for relevance, language, history, safe alternatives, and time budget only when session-linked. `manualReview` in reports gives this checklist, not a verdict. No independent AI judge is called; this avoids extra quota and false confidence.

## 1. Source and offline tests

PowerShell at repo root:

```powershell
Expand-Archive "$env:USERPROFILE\Downloads\SportHub_Coach_AI_Plan_50_Tests.zip" -DestinationPath . -Force
python .\coach-plan-tests\verify_source.py --root .
python .\coach-plan-tests\run.py --list
python -m unittest discover -s .\coach-plan-tests -p "test_runner.py" -v
```

If and only if the existing unit test is still the original broken V1 file (CS8752 at lines 43/74/79), use the corrected copy, after inspecting any local edits. Do not overwrite other files.

```powershell
Copy-Item .\coach-plan-tests\CoachPlanContextTests.cs .\backend\SportHub.Scheduling.Tests\Unit\CoachPlanContextTests.cs -Force
```

Context and budget tests (12 xUnit cases in 7 facts and one 5-row theory):

```powershell
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter "FullyQualifiedName~CoachPlanContextTests"
```

Checks: class aggregation, personal scope, unknown data, byte budget and safety notes, historical progress, topic counts, context compression and output prescriptions. These are not Gemini live tests. The separate V1 integration test checks actual DB queries, present-only assessments, roster and history isolation, identical full context in generation/review, and no auto-save. It uses a deterministic HTTP gateway stub, not live Gemini. Use only a disposable PostgreSQL test database/Docker; never point `SPORTHUB_TEST_POSTGRES` at a shared or production database. Review the repository's SchedulingApiFactory before running.

```powershell
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj --filter "FullyQualifiedName~CoachPlanContextIntegrationTests"
```

## 2. Live fixtures — local isolated synthetic environment only

Restart the API using Coach Plan V1 and the Python AI service with a valid Gemini API key, actual model, and available quota. Use actual API port from startup output. Do not use deployed production DB or accounts. Log in as synthetic coach in local frontend. DevTools Network: select the class/teaching request and copy ClassId, SessionId, MemberId and Authorization Bearer JWT (JWT only, not the `Bearer ` prefix). Do not share tokens, keys or actual student data in chat. `--synthetic-only` is the user's confirmation of isolation, not a database detector. If your local backend uses a remote/shared DB, stop and use a disposable local DB first.

Required fixture: coach's own active Badminton class, upcoming scheduled session, confirmed active student. Optional: completed/past session, outsider (not enrolled), transferred-out/ended member, other session in same class assigned to another coach (scheduled future), session belonging to a different class. Optional role tests use real JWTs for an unrelated coach and a Member. Do not use personal live accounts.

Enter the values interactively in PowerShell (not literal placeholders):

```powershell
$ClassId = Read-Host "Synthetic ClassId"
$SessionId = Read-Host "Upcoming SessionId"
$MemberId = Read-Host "Active MemberId"
$ApiBase = Read-Host "Local API base (e.g. http://localhost:5000)"
```

The runner securely prompts for Coach JWT (not Gemini API key) unless `SPORTHUB_COACH_TEST_TOKEN` is already set in the process environment. Optional auth tokens: `SPORTHUB_OTHER_COACH_TEST_TOKEN` and `SPORTHUB_MEMBER_TEST_TOKEN`; use your local secure tooling to populate them, not plaintext in shell history. No token or key is written to reports. The runner refuses non-loopback targets, ignores proxy settings, and refuses redirects. If HTTPS certificate is not trusted, use the actual local HTTP port or trust development certificate; no TLS bypass.

## 3. Run happy and unhappy (real app)

Smoke: CP-037 only (1 plan request, normal 3–5 backend model calls):

```powershell
python .\coach-plan-tests\run.py --synthetic-only --api-base $ApiBase --class-id $ClassId --future-session $SessionId --member $MemberId --ids CP-037 --expected-model gemini-3.5-flash-lite --open-report
```

All 50 case definitions (optional fixture cases become NOT_RUN when not supplied):

```powershell
python .\coach-plan-tests\run.py --synthetic-only --api-base $ApiBase --class-id $ClassId --future-session $SessionId --member $MemberId --group all --max-live-cases 20 --expected-model gemini-3.5-flash-lite --open-report
```

To exercise the optional ID cases, append `--past $PastSessionId --outsider $OutsiderMemberId --ended $EndedMemberId --other-session $OtherSessionId --foreign-session $ForeignSessionId` using actual synthetic fixture IDs. With absent optional JWTs, CP-027/028 are NOT_RUN. Without optional fixtures 42/50 are selected for execution (eight NOT_RUN); actual outcomes depend on the app. `--group happy|unhappy|local|scope|semantic|session|personal` selects individual groups. `--ids CP-037 CP-045` selects exact cases. `--max-live-cases` is a count of planned semantic/happy app requests, not a hard cap on actual Gemini calls. Happy cases 14 × 3–5 calls = 42–70 plus semantic negatives normally up to one per case, excluding retries or erroneous generation for negatives. Local and scope cases should be rejected before hitting Gemini; the runner cannot directly measure provider calls. Check server logs. Default stops after first infra failure; `--continue-infra` explicitly overrides. It also halts on unexpected coach JWT 401. No retry loop, default delay 1 second between requests. The current free-tier quota may be shared with V37. Check before running.

## 4. Reports

`coach-plan-tests/reports/<timestamp>/index.html`, `results.json`, `results.csv`, `junit.xml`. Each case contains scope, request input (synthetic only), expected HTTP/error, actual status/error, returned plan (if any), reported provider/model, elapsed time, reason and manual checklist. PASS = exact HTTP + error code on rejection; or 200 + expected provider/model + output contract on success. Rejects and model content quality still need review: malformed goal verdict can share the same `training_goal_invalid` error as a valid semantic rejection, so an exact error does not prove the model classified it correctly. `FAIL` is an unexpected result, including 502 `ai_suggestion_invalid_output`; `INFRA_ERROR` is transport/provider/quota failure; `NOT_RUN` is missing optional fixture or halted/budget-limited. 500 is FAIL. JUnit maps infra/not-run to skipped. Exit 0 all selected PASS, 1 failure/infra, 2 not-run only. Do not merge into V37 reports.

API output format checks: 4–24 lines, no Markdown/prefix, each line `Heading · Details`, minimum 3 prescriptions for session or 2 for personal, all recognized sets/reps strictly positive integers. Extra coaching/adaptation lines may be non-exercise advice. It cannot establish every exercise has a prescription or that a plan satisfies every restriction; manually check actual content. Actual token count and raw Gemini prompts are not exposed by this endpoint, so no invented token figures appear in the reports. For evidence of actual scoped context use existing V1 integration tests, and inspect CoachPlan stage/contextBytes logs for live requests, without logging raw student profiles. UI Use/Save remains a separate manual test. This package does not grant clinical safety certification.

## 5. Verification status

Python runner self-test: 6 passed (matrix, validation, verdicts, reports, redaction, local HTTP transport/redirect handling). Stub HTTP only for runner self-tests. Source hashes derived from supplied archives and corrected test. Actual .NET build/test, live Gemini, DB and UI NOT_RUN in packaging environment (no .NET SDK, no user's localhost). No source changes made. Context coverage relies on existing V1 C# tests. Existing dependency security warnings outside this test-only scope.

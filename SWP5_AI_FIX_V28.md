# SWP-5: Member AI V28 Fix and Regression Guide

**Snapshot:** SWP-5 user ZIP of 2026-11-05, changed locally. **Scope:** Flow 6 Member/Coach assistants, Coach lesson-plan AI routing, verified Member session evidence and analysis. **No database migrations.**

## 1. Identified causes from source (not from production logs)

1. **Seven-hour mismatch:** `MemberScheduleServicesEvidenceV21` supplied `ClassSession.StartAtUtc` and `EndAtUtc` and asked Gemini to convert. The screenshot demonstrates the model displayed `08:00–10:00 (UTC)` where the Member UI showed `15:00–17:00` in Vietnam (UTC+07:00). The authoritative scheduler already uses `VietnamTime` from `SportHub.BuildingBlocks`.
2. **Missing past/present/future attendance:** `MemberDataHub` Attendance previously queried only existing `Attendance` rows, omitting sessions with no attendance record. The authorized Member schedule joins `Enrollment` + `ClassSession` + `Attendance`, so the AI evidence was incomplete. `null` does not mean Absent. Only explicit `Present`/`Absent` records are definitive.
3. **HTTP 503 collapsed errors:** `MemberGeminiDataHubV26.TryAnswerAsync` converted *planner exception*, *planner invalid JSON*, *answer exception*, and *empty answer* to the same `member_gemini_data_hub_unavailable` HTTP 503. The screenshots give HTTP 503 without the API `error` body or backend trace, so **the specific runtime trigger of each pictured request cannot be proven**. It would be incorrect to attribute them to a bad Gemini key, a Railway outage, a model mismatch, or database downtime without logs.
4. **Insufficient Member privacy gate:** prompt instructions said not to disclose unrelated members, but there was no deterministic refusal for classmate roster/profile inquiries *before* calling Gemini. The retrieved evidence remains JWT-scoped, but responses should explicitly refuse impermissible requests.
5. **Provider path cross-role coupling:** `PythonAiChatProvider` previously posted all role prompts, including Coach prompts, to `/member/chat`. The provider did not enforce separate model task wrappers.

## 2. Implemented changes

- `MemberSessionTimelineV28.cs`: authorized Member-only enrollment/session/attendance join. Two bounded queries independently retain historical and upcoming sessions. All comparisons use the server `IClock.UtcNow`; all displayed times use `VietnamTime.ToLocal` (Asia/Ho_Chi_Minh, UTC+7). Returned states: `Present`, `Absent`, `Unrecorded` (not proof of absence), and `Future`/`InProgress`/`Past`/`Cancelled`.
- `MemberDataHub.cs`: Attendance and Schedule read from V28 timeline rather than incomplete attendance-only queries. `MemberScheduleServicesEvidenceV21.cs` uses the same timeline and materializes court-rental local clock times. `MemberCenterFactsV27.cs` includes local timestamps on saved Coach plans.
- `MemberVerifiedQueryV28.cs`: role-verified deterministic short answers for (a) other-member privacy refusal, (b) next session time, (c) current/previous/future session attendance, (d) a bounded attendance summary, and (e) a volume-based comparison of the current Member's Coach workout plans. Plan comparison uses total sets and repetitions and **does not assert subjective difficulty** without load, intensity and rest measurements. Works without Gemini for these queries.
- `MemberGeminiDataHubV26.cs`: model planner still selects from strict allowlist; invalid planner output falls back to `MemberTopicFallbackV28` with backend-controlled domain selection. Provider failures retain their original `AppException` status/error code and are logged. Stage-specific answer failures are HTTP 502, not mislabeled 503. Context contains server-derived local time and explicit attendance/privacy/analytical reasoning instructions.
- `PythonAiChatProvider.cs`, `PythonCoachChatProvider.cs`, `PythonCoachPlanProvider.cs`, `AiChatService.cs`, `ClassTeachingAiController.cs`, `Program.cs`: authenticated .NET role selects independent AI client routes: Member `/member/chat`, Coach `/coach/chat`, Coach teaching-plan `/coach/plan`. The Manager scheduling path is unchanged. The published role/category prompts remain in use. These routes share a Python deployment/model client by default; they are **separate pipelines, not separate infrastructure instances**.
- `ai-service/app/api/coach.py` and `services/coach_chat_service.py`: separate Coach request wrappers and endpoints; member endpoint remains unchanged. Provider errors are logged on the Python side without exposing upstream payloads to frontend users.
- `frontend/src/features/member/assistant.tsx`: specific, bounded user messages for `ai_service_unavailable` (connection), `ai_service_timeout` (timeout), `ai_service_error` (upstream non-2xx), `member_ai_answer_empty`, and other error codes. Unknown HTTP 503 deliberately does not claim an invented root cause.

## 3. Regression cases and acceptance conditions

| Test | Query / stimulus | Expected |
|---|---|---|
| M1 | `lịch học gần nhất khi nào?` | First future *scheduled* session in the Member's account; e.g. `08:00 UTC` = **`15:00` Vietnam time**, matching My schedule; no extra seven-hour conversion. |
| M2 | `tôi đã được điểm danh cho buổi học thời gian hiện tại?` | Current/nearest authorized session; recorded Present/Absent only if stored; otherwise `Chưa ghi nhận`, not `Vắng mặt`. |
| M3 | `tổng hợp lịch sử điểm danh các buổi của tôi` | Present/Absent/Unrecorded broken out; truncated warning if 90+ past/future. No other member's record. |
| M4 | `cho tôi thông tin các học sinh học cùng lớp` | Immediate permission refusal with no request to Gemini. English roster/classmate queries also refused. |
| M5 | `plan nào khó tập nhất?` | Own saved Coach plans only; relative **sets/repetitions**; not a claim of proven training difficulty. |
| M6 | Mixed legitimate Member analysis | Allowed topics + verified evidence + Gemini response, or exact provider error, never invented counts. |
| C1 | Coach: `What are my assigned teaching sessions?` | Coach-only data scope and provider route; Member direct privacy rules do not affect Coach. |
| C2 | Coach AI class lesson-plan suggestion | Separate `/coach/plan` route, still requires assigned Coach and official review flow. |
| E1 | Python Gemini request returns non-2xx | HTTP 502 `ai_service_error`; Python logs show underlying exception. |
| E2 | .NET cannot reach AI Python service | HTTP 503 `ai_service_unavailable` (concrete network failure). |
| E3 | Python service times out | HTTP 504 `ai_service_timeout`; a known timeout, not a generic 503. |
| E4 | Planner returns malformed JSON | Safe deterministic Member topic fallback; final model still requires valid output. |
| E5 | Member A attempts Member B data | Answer refuses, and backend queries filter solely by Member A's JWT ID. |

## 4. Validation carried out in this workspace

- Python syntax: `python -m compileall -q ai-service/app` **PASS**.
- TestClient route smoke: `PYTHONPATH=ai-service pytest -q ai-service/tests/test_role_routes.py` **2 PASS** with fake Gemini implementation, without network.
- File-level comparison to uploaded ZIP: changes restricted to the AI and Member evidence/routing/UI areas plus test/docs/scripts; **no files deleted**.
- Not run: `dotnet build/test` because .NET SDK 10 is unavailable; `npm run typecheck/build` because Node 24/npm 11 and installed frontend dependencies are unavailable; no PostgreSQL/Gemini live credentials or deployed service logs in this sandbox. **Do not mark production tests PASS until executed.**

## 5. Deployment and live checks (Windows PowerShell)

Deploy **Python AI service first**: the new Coach paths must exist before updating .NET to call them. Ensure `GEMINI_API_KEY` and the configured Gemini model are valid on the deployment. Then deploy .NET backend with the correct `AiService:BaseUrl`, and finally frontend. No EF migration is required.

```powershell
cd ai-service
python -m pip install -r requirements.txt
python -m pip install pytest
python -m pytest tests/test_role_routes.py
cd ..

dotnet restore backend/SportHub.sln
dotnet build backend/SportHub.sln -c Release
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj -c Release

cd frontend
npm ci
npm run typecheck
npm run build
cd ..

# Tokens are local environment variables: do not copy them into source, screenshots or logs.
$env:SPORTHUB_MEMBER_TOKEN = "<current Member JWT>"
$env:SPORTHUB_COACH_TOKEN  = "<current Coach JWT>"
.\scripts\verify-swp5-ai-v28.ps1 -ApiBase "http://localhost:5000"
```

Use Node 24/npm 11 for frontend. For 5xx failures, capture **HTTP status + JSON `error` code + correlated backend/Python logs**. Do not assign a runtime cause from an HTTP status screenshot alone. Verify Member A/B and Coach authorized scopes with distinct accounts, especially prior/cancelled enrollments and real status transitions.

## 6. Deliberate boundaries / follow-on risks

- This revision does not mutate the authoritative session time, class scheduling database, attendance records or invoice data. UTC storage remains unchanged; only AI facts and explanation timestamps are localized.
- Local deterministic privacy classification handles known roster/peer phrasings; **authorization through JWT-backed SQL queries remains the primary isolation control** for paraphrases outside that list. The AI cannot access raw SQL or self-select member IDs.
- The member's live court slot/price feed remains an earlier identified integration gap; do not invent availability or room rates from catalog data.
- Pipeline separation is logical/routed; Member Chat, Coach Chat and Coach Plan still share the same Python process and Gemini credentials by default. Physical isolation and rate limiting require a separate infrastructure decision.
- No deployment/runtime logs were provided; the code changes require build and E2E validation on the actual branch/server before being declared production-ready.

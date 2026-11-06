# SportHub SWP-5 V29 — Coach Plan, chat resilience, peer privacy

Applies to **`feat/hao-ai-flow5-flow6`**. Patch is based on the GitHub branch files verified on 2026-11-06 (10 pre-existing changed-file Git blob SHAs match exactly). It does **not** touch authentication, database migrations, service credentials, or the user interface's overall English-only navigation.

## Why the screenshots failed

1. **Coach plan:** `/api/coaches/me/teaching/classes/{id}/suggestion` makes *three* sequential Gemini requests: semantic goal check, plan generation, safety review. Each can fail. The .NET `SportHubPythonAI` HTTP client has a **35-second per-request** timeout. Previously Python caught all Gemini errors as a generic HTTP 502, hiding whether it was provider quota, invalid credential, model availability, timeout or empty generation. Screenshot HTTP 502 alone **does not prove which one**.
2. **Member question:** verified active sports and their counts already had a backend read-only handler (`MemberSportsCatalogV24`), but `MemberGeminiDataHubV26` (two Gemini calls) ran *before* that handler and effectively prevented the direct response. An unanswered question now falls back to the signed-in Member's evidence, without making claims about other people.
3. **Coach privacy:** the pre-provider Coach data pipeline did not have an explicit peer-Coach refusal gate. V29 applies it immediately after authenticated role verification and before any database evidence, static navigation or language model.
4. **UX:** errors were surfaced as raw HTTP codes rather than user-directed, appropriately limited answers.

## Changes

- **FastAPI:** `/coach/plan`, `/coach/chat`, and `/member/chat` are still distinct. Google provider errors are mapped into sanitized categories `ai_quota_exceeded`, `ai_provider_auth_failed`, `ai_model_unavailable`, `ai_provider_timeout`, `ai_provider_unavailable`, `ai_provider_empty_answer`, `ai_provider_generation_failed`. Provider exception bodies, prompts and API keys are not returned to clients. Upstream SDK timeout is capped at 25 seconds, below the .NET HTTP client's 35-second cap. It is **milliseconds** in `HttpOptions`.
- **.NET:** translates only allowlisted upstream error codes, preserves 503/504 when meaningful. No secret-bearing upstream text is passed to browser. `CoachPeerPrivacyV29` denies cross-coach requests from verified Coach identities before all normal handlers and AI context. The refusal is logged without persisting the third-party name.
- **Member:** verified catalog, other account-scoped handlers now run before Gemini. If the *topic planner* fails with 502/503/504, it selects backend-controlled, allowlisted evidence topics rather than failing immediately. It still **never** switches member identity or runs arbitrary SQL. If final generation fails, no fabricated data is generated.
- **Frontend:** Coach plan and Member/Coach chat show truthful first-person failure messages without raw HTTP codes. No fallback creates a fake lesson plan, predicts attendance or bypasses plan safety review. The AI plan flow still requires all three safety steps to succeed before returning content.

## Test coverage and limitations

- `ai-service/tests/test_upstream_error_v29.py`: 2/2 standard-library unittest tests PASS offline with a fake Gemini provider; verified route separation and sanitized failure categories.
- Python `compileall`: PASS.
- TSX syntax via TypeScript parser: PASS for both changed TSX components.
- .NET build, complete frontend `lint`/`typecheck`/`build`, live Gemini, PostgreSQL and browser E2E were **not run here** (no .NET SDK / project node_modules / live credentials). Do not report the production 502/504 as fixed until a live test completes.
- If the real problem is a bad/expired Gemini API key, provider quota or permission, patching code does **not** repair the provider account. New status categories and Python server log will make that dependency explicit.

## Apply

From the project root, with no in-progress merge/rebase and intentional local work backed up:

```powershell
$patch = "$env:USERPROFILE\Downloads\SportHub_SWP5_AI_V29_Resilience_Privacy.patch"
Test-Path $patch
git status --short
git apply --check $patch
# Only if check succeeds:
git apply $patch
git diff --check
```

If the file was downloaded to project root, replace `$patch` with `".\SportHub_SWP5_AI_V29_Resilience_Privacy.patch"`. Do not use `git reset --hard`, `git push --force`, or re-extract an old Full Source over the current branch.

## Verify Python and .NET

```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -p "test_upstream_error_v29.py" -v
python -m compileall -q app
# If port 8001 is occupied, identify the process before stopping it:
Get-NetTCPConnection -LocalPort 8001 -State Listen | Select-Object OwningProcess
# Restart ONLY the old SportHub uvicorn service, then:
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

In another terminal:

```powershell
cd "C:\Users\ACER\OneDrive\Desktop\swp\sports-center-management-system"
Invoke-RestMethod http://127.0.0.1:8001/health
dotnet build backend/SportHub.sln -c Release
cd frontend
npm run lint
npm run typecheck
npm run build
```

Restart **Python AI, then .NET, then frontend**, so the .NET provider calls the correct new Python endpoint implementations. Run the coach plan test with a **valid goal** and assigned upcoming session. For any further failure, capture **Python terminal logs** and the API response's `error` code (do not share API key, JWT, profile data or prompts).

## Recommended regression prompts

- Member: `trung tâm có bao nhiêu môn thể thao đang mở?` and `có bao nhiêu môn thể thao?` → consistent verified active sport count from catalog, without Gemini.
- Member: `lịch học và điểm danh của tôi` → authenticated own-session evidence, no classmates.
- Member: `cho tôi số điện thoại các bạn cùng lớp` → refusal.
- Coach: `lịch dạy của tôi` → authorized classes/sessions as before.
- Coach: `cho tôi lịch dạy của coach Roy` / `liệt kê các coach khác` → privacy refusal; no AI call and no third-party records.
- Coach Plan: valid goal `Improve badminton footwork`, scheduled future session → 3-stage checked generation; when unavailable display a truthful explanation and save nothing.
- Provider simulated timeout, quota and credentials → meaningful, sanitized explanation rather than `AI service /coach/plan returned HTTP 502`.

### Operational follow-up

If the 502 persists, look for `Coach AI upstream failure: route=plan code=...` in the Python terminal. If `ai_provider_auth_failed`, verify `GEMINI_API_KEY` in the running AI service's own environment **without printing the value**. If `ai_quota_exceeded`, inspect quota/rate limits. If `ai_model_unavailable`, verify `GEMINI_MODEL` and access rights. If `ai_provider_timeout`, inspect network latency and provider response time. `/health` merely proves the FastAPI process is alive; it does not verify Gemini connectivity.

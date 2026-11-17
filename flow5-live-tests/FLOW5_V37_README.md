# SportHub Flow 5 — V37 (no session-duration dependency)

## Install and run
Extract this archive into the SportHub repository root with V36 already installed. Back up local runner edits before replacing them. The installer checks a normalized SHA-256 of the generator, accepts only the known V36/V37 versions, and saves a backup of the previous generator. It does not update unrelated files or the database schema.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-flow5-v37.ps1"
dotnet run --project ".\flow5-live-tests\Flow5.LiveTests.csproj" -c Release -- --self-test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-flow5-live-tests.ps1" -MaxCases 30 -MaxCalls 150 -OpenReport
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-flow5-live-tests.ps1" -Filter INPUT_ -MaxCases 20 -MaxCalls 60 -OpenReport
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-flow5-live-tests.ps1" -All -MaxCalls 250 -OpenReport
```

The self-test uses fixture responses and a local HTTP handler; it is not real-Gemini evidence. The normal runner uses real Gemini and synthetic profiles only. `-All` selects 50 tests; `-MaxCases 30` selects the original IDs 001–030 (some expectations changed). The models may incur API charges. Run only with your own authorized key in the environment or existing local configuration. API errors may still be INFRA_ERROR; retry is bounded and the cap includes retries. Do not override a true rejection to obtain a higher pass rate.

## Main change
- Remove `sessionMinutes` from generation, review and external-judge profile JSON, not just the arithmetic assertion. Keep the stored field in the existing DTO/UI and report Input for traceability; it no longer influences any model request. Keep API timeout and attendance history window (unrelated to workout duration).
- Preserve Exercise, Sets, Reps, Notes, Rationale, 4–12 items and existing numeric bounds. Individual timed movements can use reps=1 and optional practical time instructions in notes. No total-time constraint or mandatory completion of all exercises.
- Prompt reviewers to prefer safe alternatives and avoid invented restrictions or subjective preferences. Explicit clinician limitations and unresolved severe symptoms remain binding. This is not a medical safety guarantee.
- LIVE-007, 008, 030 remain as regression scenarios for removal of time context, not proof that time affects personalization. Self-test checks profiles differing only in saved duration are identical after projection. LIVE-027 and 028 now require rejection of malicious instructions; LIVE-026 retains proper safety clarification for the actual unresolved fracture.

## Unhappy cases
- 20 new cases LIVE-031 through LIVE-050. Local invalid values/length/known HTML or JS patterns return a stable 409 notification before any Gemini request. The text length limit is a new proposed generator limit of 1000 characters; existing UI/profile input constraints can be stricter. This regex is only defense in depth, not a complete XSS sanitizer. Continue encoding user/model output on the UI and use normal storage validation.
- Semantic cases expect real Gemini to classify UNSUITABLE_INPUT into a fixed allowed category, with a reason and no exercises. Backend maps category to fixed English messages rather than relaying raw AI/user text. All test assertions require exact code/message, matching category and no returned workout. Local negative tests require zero API calls.
- New test cases are direct-generator tests, not browser/controller/persistence integration tests. The V32 service patch preserves AppException and archived frontend handles HTTP 409 error messages. The user's current route/UI still needs integration verification; this package does not change the upstream profile save/API or Coach workflow.
- `new-unhappy-cases.json` contains all new expected inputs and notifications, not actual outcomes.

## Previous evidence / limitations
V36 actual report is 21 PASS, 3 FAIL, 6 INFRA_ERROR; 100 calls, 34 HTTP 503 and 4 HTTP 429. LIVE-030 is a false time rejection; time removal alone could change 21 to 22 if retested successfully. 24/30 is possible if all three previously failing scenarios pass safely; not guaranteed. LIVE-017 and 023 require appropriate exercise lists, not silent override of explicit clinician restrictions. New policy changes LIVE-027/028 and other cases may produce different results. See `audit-v36-30-tests.json` for the unchanged evidence.

No .NET SDK or PowerShell is available in the authoring environment. Source changes and package checks were performed statically; the new code has not been compiled, self-tested or run against Gemini here. Do not treat this as a release signoff.

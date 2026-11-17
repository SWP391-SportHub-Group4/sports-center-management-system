# Coach Plan V2.2 — single generation, English output
Requires installed V2.1 English-only patch and V2 live runner/integration test. No member, Python, router, DB, frontend or controller modifications. Output guard regex unchanged; removed obsolete comment only. The first call performs semantic assessment, generation and self-check. One retry after 2s on explicitly transient service/provider errors or malformed output; no retry on quota/auth/invalid goal. Provider attempts counted by runner, not hidden SDK attempts. Second-call review removed intentionally: cannot claim independent semantic verification. English prose is prompt-driven, prescription units locally guarded. Coach reviews manually. Persistent outages remain INFRA_ERROR.

From repository root, after extracting ZIP:
```powershell
python .\coach-plan-v22\install.py --root . --check
python .\coach-plan-v22\install.py --root .
dotnet test .\backend\SportHub.Scheduling.Tests\SportHub.Scheduling.Tests.csproj -c Release --filter "FullyQualifiedName~CoachPlanContextTests"
dotnet run --project .\coach-plan-v2\live-tests\CoachPlan.LiveTests.csproj -c Release -- --id CPV2-001 --max-calls 2
```
Python service must be running on port 8001, using real Gemini. If successful, test CPV2-004 (Vietnamese goal, English response), then `--group all --max-calls 100`. Reports include sanitized transport HTTP status and attempt history. Review actual draft for semantic correctness. No test expectation on goal validity changed. Rollback: `python .\coach-plan-v22\install.py --root . --rollback BACKUP_ID`. If baseline conflicts, inspect differences instead of forcing overwrite. No .NET SDK available in package creation environment; build/unit/integration/live not executed here.

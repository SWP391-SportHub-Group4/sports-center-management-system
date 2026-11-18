# SportHub Flow 6 chat fallback and navigation patch

For the exact `sports-center-management-system-develop(3).zip` source snapshot. The installer checks SHA-256 for all seven source files before changing anything and backs up originals in `.sporthub-flow6-chat-backups`.

Changes:
- Member and Coach chat switch to configured fallback models when Gemini returns quota, transient provider, or timeout errors. Auth errors still fail immediately. Coach plan and Flow 5 retain existing behavior.
- Chat responses report the model actually used.
- Explicit Member navigation questions, including “tham gia lớp học ở đâu” and “nút thông báo”, use verified local UI guidance before the Gemini data planner. Personal-data questions still use account-scoped evidence.
- The configured model list is unchanged. If all models are rate limited or the router is disabled, errors still surface. The SQLite accounting counters are estimates, not provider telemetry.

From the repository root in PowerShell, after extracting the ZIP from Downloads:

```powershell
python .\sporthub-flow6-chat-patch\install.py --root . --check
python .\sporthub-flow6-chat-patch\install.py --root .
python .\ai-service\tests\test_gemini_model_router.py
```

Restart the Python AI service and .NET backend after applying. If `--check` reports `MISMATCH`, do not force the patch: the local branch differs from the reviewed snapshot. .NET build and live Gemini behavior were not available for verification in the packaging environment.

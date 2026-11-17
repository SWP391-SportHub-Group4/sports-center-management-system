# SportHub V37 — Flow5 Model Router Add-on

Production path: .NET PythonAiChatProvider -> /member/chat -> GeminiService. This patch uses the exact Python source in the supplied feature archive (hash guard). It does not change .NET, prompts, schema, tests or frontend. Routing activates only for the two existing V37 trusted system prompt prefixes; other Python chat operations retain the primary model and contribute to its estimated usage. The standalone V37 runner calls Google directly and intentionally bypasses this router; it does NOT validate routing or increment these counters.

## Install (PowerShell from repository root)
Extract ZIP into repository root (creates `router-addon/`). Activate the same Python venv as ai-service.

```powershell
python -m pip install tzdata
python .\router-addon\install_router.py --root .
python -m unittest discover -s .\router-addon\tests -v
```
Installer refuses unrecognized Python source. It creates a timestamped backup; keep its path. No secrets are accessed. If installation refuses, do not force overwrite; compare your current files.

## Configure
Edit `ai-service/gemini-router.json`: set `project_scope` to the actual Google project ID (not the API key), add actual daily limits and approved fallback model IDs, then set `enabled` true. Example only (replace 100 with verified quota; not a claim about Google):

```json
{"enabled":true,"project_scope":"your-project-id","threshold_percent":90,"daily_limits":{"gemini-3.5-flash-lite":500,"gemini-2.5-flash":100},"fallback_models":["gemini-2.5-flash"]}
```
Only use generateContent-compatible models available on the same authorized project; verify each separately with V37 runner `-Model <id>` (check runner parameters). Do not use Live API models. Restart Python service. No API key change needed. Do not commit the SQLite state or backups; add `.gemini-router.sqlite3*`, `.flow5-router-backup-*` to local git exclude. Configuration contains no secret but project scope is environment-specific.

Router reserves a request atomically before each SDK invocation; attempts are conservatively counted even if unsuccessful. At 90% of configured RPD it skips to next model. On daily quota error it blocks until Pacific midnight; other quota errors cool down 60 seconds, transient provider errors 15 seconds. Each candidate attempted at most once per logical call. Authentication, invalid requests, empty response and semantic validation failures do not trigger fallback. Existing timeout limits remain; a slow first request may exhaust .NET's deadline before fallback completes. Existing SDK retry behavior is unchanged. Logs contain model and sanitized error code, not upstream body or key. Response model metadata reflects the model actually used by member endpoint.

SQLite is persisted locally and shared by processes using the same file on one host. For containers mount persistent writable storage at `ai-service` or provision a shared quota service before multi-host deployment. Counts start at zero: external callers, earlier usage, direct V37 live tests, and internal SDK retries are not tracked. No live provider quota query, no exact RPM/TPM tracking; real 429 handles discrepancies. Switch project scope only when credentials actually change project. Do not reset counters to evade limits. Threshold is conservative, including for the last model; leave 10% reserve. Config and DB errors fail closed for Flow5; disable or fix config if necessary. No direct database access to SportHub.

## Verification
Six deterministic offline router unit tests passed locally. These simulate upstream outcomes and do not contact Google. Python syntax checked. Installer hash guard and rollback tested on temporary copies. No SDK integration, actual localhost/deployment test, or live fallback validation in this environment. Test each candidate separately using existing V37, then verify actual /member/chat integration via UI and logs. Existing 50 cases stay unchanged. Do not interpret offline tests as AI-quality evidence.

## Disable / rollback
Set `enabled` false in config (read each invocation). To restore source, from root run:

```powershell
python .\router-addon\install_router.py --root . --rollback ".\.flow5-router-backup-<timestamp>"
```
Replace placeholder with printed backup path. Restart Python service. Rollback refuses modified installed files. Config/counters remain untouched.

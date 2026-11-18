# SportHub four Gemini project quotas

Apply `SportHub_Flow6_Current_Compatible_Patch.zip` first. This patch only edits the Python AI service; existing .NET API paths and role checks stay in place.

When `GEMINI_MULTI_PROJECT_ENABLED=true`, requests are mapped as follows:

| Feature | Route | Profile |
| --- | --- | --- |
| Coach AI Plan | `/coach/plan` | PLAN |
| Member workout Suggestion and profile validation | `/member/chat` with Flow 5 system prompt | SUGGESTION |
| Member Chat | `/member/chat` with Flow 6 system prompt | MEMBER_CHAT |
| Coach Chat | `/coach/chat` | COACH_CHAT |

Set the following in `ai-service/.env` on the server, using real values from four distinct Google projects. Do not send keys in chat or commit `.env`:

```dotenv
GEMINI_MULTI_PROJECT_ENABLED=true
GEMINI_PLAN_API_KEY=...
GEMINI_PLAN_PROJECT_ID=...
GEMINI_SUGGESTION_API_KEY=...
GEMINI_SUGGESTION_PROJECT_ID=...
GEMINI_MEMBER_CHAT_API_KEY=...
GEMINI_MEMBER_CHAT_PROJECT_ID=...
GEMINI_COACH_CHAT_API_KEY=...
GEMINI_COACH_CHAT_PROJECT_ID=...
```

Keep the existing `GEMINI_API_KEY` for existing manager/legacy calls, and `GEMINI_MODEL`. Each request uses the same primary model and existing fallback model list in `gemini-router.json`, but the selected project's key and independent local quota counter. Set `daily_limits` conservatively based on the actual limits displayed for each project/model; local counters cannot read Google quota. The current router file must have `enabled: true`. If these four project variables are missing or duplicate, routing fails closed rather than accidentally sharing a project. A project ID is for scope accounting; the configured API key must truly belong to that project.

PowerShell at repository root after extracting the ZIP from Downloads:

```powershell
python .\sporthub-four-projects-patch\install.py --root . --check
python .\sporthub-four-projects-patch\install.py --root .
python .\ai-service\tests\test_gemini_model_router.py
python .\ai-service\tests\test_gemini_project_profiles.py
```

Restart the Python AI service after setting `.env`. Test one request per AI and verify model/project usage in each Google project dashboard. There is no .NET SDK or provider key in the packaging environment; no live provider call was made.

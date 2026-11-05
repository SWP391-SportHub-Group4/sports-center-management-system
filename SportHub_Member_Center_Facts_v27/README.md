# SportHub Member Center Facts + Workout Gemini Reliability v27

## Requirements

Install v26 first (MemberGeminiDataHubV26 + MemberWorkoutContextV26 hooks).

## Scope and accuracy

- `MemberCenterFactsV27.cs` reads **all sport catalog rows** with `IsActive`, enabled service offerings, Member-owned saved `WorkoutPlan` items and Member-owned `WORKOUT_SUGGESTION` logs.
- Existing `MemberGeminiDataHubV26` uses Gemini planner -> Member Data Hub -> Gemini answer. Adds `sports` as a distinct topic; changes `training` to detailed plans. Existing domain evidence remains available.
- Workout validator retries one transient provider failure and accepts a single embedded JSON object only after strict schema validation. No validation bypass. An exercise goal in **Injuries/Limitations** remains `WRONG_FIELD`. The goal belongs under Your goal -> Add details. Food allergies can simultaneously contain foods; actual injuries can remain if relevant. An empty injury field is not necessary.
- The code **does not change Coach Chatbox, Coach AI Plan, Member chat shared entrypoint, Manager Published Prompts or DB schema.** It reuses the existing v26 hooks.

## Safety and limitations

- This is read-only evidence at application level, not PostgreSQL SELECT-only credentials. Chat logging remains separate.
- The user ID comes from authenticated JWT, never from the question.
- The `WorkoutPlan` entity contains coach-authored plans; AI suggestion history is stored as JSON logs. The UI may also use lesson plan data under another source; inspect if discrepancies remain.
- `courtRental` currently exposes catalog only. **Real slot status, price and duration require calling the canonical `CourtRentalService.CalendarAsync`** with authenticated Member ID, sportId, date, and hours. The canonical service already accounts for rates, opening hours, current occupancy and holds, and returns `AVAILABLE`, `HELD`, `BOOKED`, `BLOCKED`, `SCHEDULED`, `UNAVAILABLE` and `NO_RATE`. This patch does **not** claim live rental availability because a safe DI route from the Member Chatbox to that service is not yet present. Prices seen in screenshots are examples, not constants.
- If Python `/member/chat` does not actually connect to Gemini, the validator still fails closed. Retry cannot fix a misconfigured provider. Inspect status/exception of provider separately.
- The installer recognizes v26 hooks and applies surgical edits to existing Member files, preserving unrelated later hotfixes. It refuses modified anchors or partial installs.

## Install in PowerShell

```powershell
cd "C:\Users\ACER\OneDrive\Desktop\swp\sports-center-management-system"
Expand-Archive ".\SportHub_Member_Center_Facts_v27.zip" ".\_MemberV27" -Force
python .\_MemberV27\tests\check.py
python .\_MemberV27\tools\install.py --repo .
# Only if DRY RUN PASS:
python .\_MemberV27\tools\install.py --repo . --apply
dotnet build .\backend\SportHub.AI\SportHub.AI.csproj -c Release
```

## Acceptance questions

1. “Trung tâm hiện có những môn nào?” → all active sports from `Sport`, not only two CourtRental offerings. Distinguish inactive/historical sports.
2. “Môn nào có thể thuê sân?” → enabled `CourtRental` offerings, not all Sport rows.
3. “Tôi có những Workout Plans nào?” → plans scoped by authenticated Member ID.
4. “Plan của tôi có những bài tập, sets và reps nào?” → saved plan item details; never invent missing items.
5. “Các AI Suggestions gần đây của tôi?” → member-owned log previews only.
6. “Sân nào trống 18:00 ngày mai và giá bao nhiêu?” → **must not claim answer until canonical calendar is wired**.
7. Valid goal + food declaration + valid injuries: Gemini returns `VALID` → workout generator invoked.
8. Meaningless goal/food: explicit clarification, no generation.
9. Goal written in Injuries/Limitations: `WRONG_FIELD`, no generation; correction under Goal Details.
10. Gemini outage / invalid JSON: HTTP 503, no unvalidated generation.
11. Member A vs Member B: no cross-account data.
12. Coach Chatbox and Coach AI Plan regression checks unchanged.

.NET SDK and live Gemini/Railway are not available to this package's offline checks. Do not mark runtime tests PASS without executing them.

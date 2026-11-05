# SportHub SWP-5 AI Workout Suggestion Type Fix — V28.2

## Scope

Correct the Member Training > Plans classification for AI workout suggestions. In the previous version, client-saved suggestions displayed “Lesson plan / AI suggestion” while the backend history entries displayed “Created by AI”. Both are AI workout suggestions, not coach-authored lesson plans.

## New contract

- API / local draft source type: `AI_SUGGESTION`.
- Display label in all Member workout suggestion cards and filter: `AI suggestion`.
- POST `/api/ai/workout-suggestions/me` includes `type: "AI_SUGGESTION"` in the response.
- GET `/api/ai/workout-suggestions/me` includes `type: "AI_SUGGESTION"` in each history entry.
- Browser-saved new suggestions include `type: "AI_SUGGESTION"`; older browser-saved suggestions without a type still render and get typed the next time a new suggestion is saved.
- `AiLog.QueryType` remains `WORKOUT_SUGGESTION` deliberately: changing it would prevent existing history queries from finding old entries.
- Coach-authored plans remain `Created by Coach`; coach permissions and session teaching plans are unchanged.

## Install (PowerShell in the repository root)

1. Inspect worktree: `git status --short`.
2. Back up or commit existing changes before overwriting files.
3. Unzip `SportHub_SWP5_AI_Suggestion_V28_2_Patch.zip` into the repository root (`-Force` overwrites the six affected files). Do not unzip it into a nested `Patch` directory.
4. Build backend: `dotnet build backend/SportHub.sln -c Release`.
5. Run frontend checks from `frontend`: `npm run typecheck`.
6. Restart the .NET backend and Next.js frontend. AI Python service / DB migration / login config changes are not required for this patch.
7. Log in as a Member and open `Training -> Plans`. All AI history and saved drafts should show `AI suggestion`. Coach plans must retain their Coach label.

Frontend-only ZIP: `SportHub_SWP5_AI_Suggestion_V28_2_Frontend_Only.zip` updates the visible labels and local storage types without modifying the backend. It accepts old API responses where `type` is missing. Use this option if the backend cannot be rebuilt yet.

## Verification performed for this patch

- All three changed TypeScript files passed TypeScript 5.8 isolated transpilation syntax checks.
- Source-level assertions confirmed both AI card sources use the same label and typed local drafts.
- The full .NET build, Next.js typecheck/build and live PostgreSQL/AI E2E tests were **not run** in the artifact environment. Verify on the development machine before merging.

## Files changed

### Frontend
- `frontend/src/lib/types.ts`
- `frontend/src/features/training/member-training.tsx`
- `frontend/src/app/member/workout-suggestions/page.tsx`

### Backend
- `backend/SportHub.AI/Domain/Constants/AiQueryTypes.cs`
- `backend/SportHub.AI/Application/Services/WorkoutRecommendationService.cs`
- `backend/SportHub.AI/Api/AiController.cs`

No database migration or changes to authentication, Member/Coach chat, or AI Python routes.

SportHub Coach AI — safe role-scoped update

This package uses a targeted Python updater to preserve local files after the develop pull.
It does not overwrite Member AI. No PowerShell script or malformed git patch.

1) Resolve Git merge conflicts first. Check: git status
2) Extract this ZIP outside the repository.
3) Open PowerShell in the SportHub repository root.
4) Run: python "C:\path\to\extracted\apply_coach_ai.py"
5) Check: cd frontend; npm run lint; npm run typecheck; npm run build
6) Check: cd ..; dotnet build backend/SportHub.API/SportHub.API.csproj

AI chat POST /api/ai/chat: Member, Coach only. Receptionist, manager, admin blocked.
Coach UI is limited to Coach role. Member's existing wolf/assistant is untouched.
Coach context includes only that coach's recent assigned sessions and own teaching records.
Coach CRUD is prompt guidance, not executable actions. No new write endpoint.
This does not remove other AI capabilities (e.g. manager schedule suggestions) because those are separate features.

The updater creates .before-coach-ai.bak files and fails before writing if anchors mismatch.

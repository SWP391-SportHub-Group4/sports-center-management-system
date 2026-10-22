#!/usr/bin/env python3
"""Apply limited AI Coach changes to the current SportHub checkout, with backups."""
from pathlib import Path
import re, shutil, sys

root = Path.cwd()
required = [
    "backend/SportHub.AI/Api/AiController.cs",
    "backend/SportHub.AI/Application/Services/AiChatService.cs",
    "backend/SportHub.AI/Application/Services/SportHubAiContextBuilder.cs",
    "frontend/src/components/AppShell.tsx",
]
if any(not (root / f).is_file() for f in required):
    sys.exit("Run from the SportHub repository root; required files are missing.")
if any(any(marker in (root/f).read_text(encoding="utf-8-sig") for marker in ["<<<<<<< ", ">>>>>>> "]) for f in required):
    sys.exit("Unresolved merge conflict found. Resolve conflicts before applying AI changes.")

changes = {}
def load(f): return (root/f).read_text(encoding="utf-8-sig")

def replace_once(s,old,new,label):
    if new in s: return s
    if s.count(old)!=1: raise RuntimeError(f"{label}: expected exactly one anchor, found {s.count(old)}; no files written")
    return s.replace(old,new,1)

f=required[0];s=load(f)
s=replace_once(s,'[Authorize(Policy = SportHubPolicies.Member)]\n    [HttpPost("chat")]','[Authorize(Roles = "Member,Coach")]\n    [HttpPost("chat")]','AI chat authorization')
changes[f]=s

f=required[2];s=load(f)
if 'using SportHub.Identity.Domain.Enums;' not in s:
    s='using SportHub.Identity.Domain.Enums;\n'+s
coach_block="""        // Coach context is scoped to the authenticated coach, never a member's user ID.
        var isCoach = await db.Set<Identity.Domain.Entities.UserAccount>()
            .AsNoTracking().AnyAsync(u => u.UserId == userId && u.Role != null &&
                u.Role.RoleName == UserRole.Coach, cancellationToken);
        if (isCoach)
        {
            var coachSessions = await db.Set<ClassSession>().AsNoTracking()
                .Where(s => s.CoachId == userId && s.StartAtUtc >= now.AddDays(-30) && s.StartAtUtc <= until)
                .OrderBy(s => s.StartAtUtc).Take(40)
                .Select(s => new { s.ClassId, s.SessionId, className = s.Class != null ? s.Class.Name : "Unknown",
                    s.StartAtUtc, s.EndAtUtc, status = s.Status.ToString() })
                .ToListAsync(cancellationToken);
            var classIds = coachSessions.Select(s => s.ClassId).Distinct().ToArray();
            var teachingRecords = await db.Set<ClassTeachingRecord>().AsNoTracking()
                .Where(r => r.CoachId == userId && classIds.Contains(r.ClassId))
                .OrderByDescending(r => r.UpdatedAtUtc).Take(20)
                .Select(r => new { r.RecordId, r.ClassId, r.SessionId, r.Kind, r.Title,
                    r.UpdatedAtUtc, content = r.Content.Length > 1200 ? r.Content.Substring(0, 1200) : r.Content })
                .ToListAsync(cancellationToken);
            return JsonSerializer.Serialize(new {
                role = "Coach", generatedAtUtc = now,
                accessScope = new { role = "Coach", coachId = userId, classIds },
                coachSessions, teachingRecords,
                note = "Read-only, limited to this coach's assigned sessions and own teaching records."
            });
        }

"""
if 'var isCoach = await db.Set<Identity.Domain.Entities.UserAccount>()' not in s:
    s=replace_once(s,'        var until = now.AddDays(UpcomingWindowDays);\n','        var until = now.AddDays(UpcomingWindowDays);\n\n'+coach_block,'coach context anchor')
changes[f]=s

f=required[1];s=load(f)
if 'CoachAiSystemPrompt.Content' not in s:
    if 'SportHubAssistantSystemPrompt.ForQuestion(question)' in s:
        s=replace_once(s,'SportHubAssistantSystemPrompt.ForQuestion(question)',
        '(contextDocument.RootElement.TryGetProperty("role", out var aiRole) && aiRole.GetString() == "Coach" ? CoachAiSystemPrompt.Content : SportHubAssistantSystemPrompt.ForQuestion(question))',
        'AI prompt selection')
    else:
        s=replace_once(s,'SportHubAssistantSystemPrompt.Content',
        '(contextDocument.RootElement.TryGetProperty("role", out var aiRole) && aiRole.GetString() == "Coach" ? CoachAiSystemPrompt.Content : SportHubAssistantSystemPrompt.Content)',
        'AI prompt selection')
changes[f]=s

f=required[3];s=load(f)
if 'import { CoachAiAssistant } from "@/features/coach/coach-ai-assistant";' not in s:
    s='import { CoachAiAssistant } from "@/features/coach/coach-ai-assistant";\n'+s if not s.startswith('"use client";') else s.replace('"use client";', '"use client";\n\nimport { CoachAiAssistant } from "@/features/coach/coach-ai-assistant";',1)
if '<CoachAiAssistant />' not in s:
    # Put launcher inside AppFrame's authenticated staff layout, not on other roles.
    marker='      <a href="#main-content" className="skip-link">'
    s=replace_once(s,marker,'      {user.role === "Coach" && <CoachAiAssistant />}\n'+marker,'Coach launcher')
changes[f]=s

# Ensure original files are intact until every textual assertion succeeds.
for f,s in changes.items():
    if '<<<<<<< ' in s or '>>>>>>> ' in s: raise RuntimeError(f+': conflict marker')
for f,s in changes.items():
    dest=root/f
    backup=dest.with_suffix(dest.suffix+'.before-coach-ai.bak')
    if not backup.exists(): shutil.copy2(dest,backup)
    dest.write_text(s,encoding='utf-8')
source=Path(__file__).resolve().parent
for f in ['frontend/src/features/coach/coach-ai-assistant.tsx','backend/SportHub.AI/Prompts/CoachAiSystemPrompt.cs']:
    dest=root/f; dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():
        backup=dest.with_suffix(dest.suffix+'.before-coach-ai.bak')
        if not backup.exists(): shutil.copy2(dest,backup)
    shutil.copy2(source/f,dest)
print('Updated Coach AI files. Backups: *.before-coach-ai.bak')
print('Run frontend typecheck/build and dotnet build before committing.')

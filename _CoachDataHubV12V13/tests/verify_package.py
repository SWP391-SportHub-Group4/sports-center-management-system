#!/usr/bin/env python3
"""Static regression and installer safety; does NOT claim .NET/Railway PASS."""
from pathlib import Path
import re
import tempfile
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
services = root/'backend/SportHub.AI/Application/Services'
hub = (services/'CoachDataHub.cs').read_text(encoding='utf-8')
orchestrator = (services/'CoachIntentOrchestrator.cs').read_text(encoding='utf-8')
checks = {
    'Hub has five primary Coach domains plus overview': all(f'case CoachEvidenceDomain.{d}:' in hub for d in ('Classes','Students','Schedule','Requests','Notifications','Overview')),
    'Class ownership scoped': 'CoachDataScope.Classes(db, id)' in hub,
    'Student enrollment scoped': 'CoachDataScope.Enrollments(db, id)' in hub,
    'Request ownership scoped': 'r.AssignedToUserId == id' in hub,
    'Notification ownership scoped': 'n.UserId == id' in hub,
    'Session Coach ownership scoped': 's.CoachId == id' in hub,
    'Bounded record retrieval': all(token in hub for token in ('.Take(30)', '.Take(40)', '.Take(80)', '.Take(100)')),
    'Role verified server side': 'u.Role.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach' in orchestrator,
    'V11 metrics preserved': 'CoachStudentMetricAnalysis.AnswerAsync' in orchestrator,
    'V12 data hub used': 'CoachDataHub.LoadEvidenceAsync' in orchestrator,
    'LLM gets bounded evidence': 'JsonSerializer.Serialize' in orchestrator and 'evidence,' in orchestrator,
    'Manager Coach published prompt preserved': 'prompts.GetPublishedAsync("Coach", ct)' in orchestrator,
    'No data write operations': not re.search(r'\.(Add|Remove|ExecuteSqlRaw|ExecuteDeleteAsync|ExecuteUpdateAsync|SaveChangesAsync)\s*\(', hub),
    'No AI Plan or Member references': all(t not in hub+orchestrator for t in ('ClassTeachingAiController','MemberPortalChat','AiMemberAnswerRouter')),
    'No arbitrary SQL': 'FromSql' not in hub and 'ExecuteSql' not in hub,
    'V10 public entrypoint signature maintained': 'internal static async Task<Result?> TryAnswerAsync(' in orchestrator,
}
for title, good in checks.items():
    print(('PASS' if good else 'FAIL')+' '+title)
if not all(checks.values()):
    sys.exit(1)
print(f'PASS {len(checks)}/{len(checks)} source checks. NOT a .NET or Railway test.')

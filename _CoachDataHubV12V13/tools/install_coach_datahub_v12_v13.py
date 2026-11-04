#!/usr/bin/env python3
"""Safe Coach-only v12/v13 install. No edits to AiChatService or other modules.

Dry-run by default. --apply only replaces existing CoachIntentOrchestrator.cs
and adds CoachDataHub.cs after strict compatibility guards and a backup.
"""
from __future__ import annotations
import argparse
from datetime import datetime
from pathlib import Path
import shutil
import sys

p = argparse.ArgumentParser()
p.add_argument('--repo', default='.')
p.add_argument('--apply', action='store_true')
a = p.parse_args()
repo = Path(a.repo).resolve()
source = Path(__file__).resolve().parent.parent
relative = Path('backend/SportHub.AI/Application/Services')
old = repo / relative / 'CoachIntentOrchestrator.cs'
hub = repo / relative / 'CoachDataHub.cs'
metrics = repo / relative / 'CoachStudentMetricAnalysis.cs'
chat = repo / relative / 'AiChatService.cs'
new = source / relative / 'CoachIntentOrchestrator.cs'
new_hub = source / relative / 'CoachDataHub.cs'
for f in (old, metrics, chat, new, new_hub):
    if not f.is_file():
        sys.exit('MISSING FILE: ' + str(f) + '\nNo files modified.')
oldtext = old.read_text(encoding='utf-8-sig')
chattext = chat.read_text(encoding='utf-8-sig')
if ('COACH_INTENT_ORCHESTRATOR_V10' not in chattext or
        chattext.count('CoachIntentOrchestrator.TryAnswerAsync(') != 1):
    sys.exit('AiChatService does not have exactly one v10 Coach entrypoint. No files modified.')
if ('COACH_STUDENT_METRICS_V11' not in oldtext and
        'CoachStudentMetricAnalysis.IsMetricQuestion' not in oldtext):
    sys.exit('Expected v11 Coach orchestrator not found. No files modified.')
if ('internal static class CoachIntentOrchestrator' not in oldtext or
        'internal static async Task<Result?> TryAnswerAsync(' not in oldtext):
    sys.exit('Unexpected Coach orchestrator structure. No files modified.')
if 'COACH_DATAHUB_V13_INSTALLED' in oldtext:
    if hub.is_file() and hub.read_bytes() == new_hub.read_bytes():
        print('ALREADY APPLIED: v12/v13 files match. No files changed.')
        sys.exit(0)
    sys.exit('v13 present, but CoachDataHub differs. Review manually.')
if hub.exists():
    sys.exit('CoachDataHub.cs already exists; refuse to overwrite. Review diff manually.')
replacement = new.read_text(encoding='utf-8')
assert 'COACH_DATAHUB_V13_INSTALLED' in replacement
assert 'CoachDataHub.LoadEvidenceAsync' in replacement
assert 'CoachStudentMetricAnalysis.AnswerAsync' in replacement
if not a.apply:
    print('DRY RUN PASS: replace ONLY CoachIntentOrchestrator.cs; add CoachDataHub.cs. No files changed.')
    sys.exit(0)
backup = old.with_name(old.name + '.before-datahub-v13-' + datetime.now().strftime('%Y%m%d%H%M%S') + '.bak')
shutil.copy2(old, backup)
# Write the new hub first; old orchestrator remains viable if interrupted.
shutil.copy2(new_hub, hub)
try:
    old.write_text(replacement, encoding='utf-8', newline='')
except Exception:
    hub.unlink(missing_ok=True)
    shutil.copy2(backup, old)
    raise
print('APPLIED: CoachDataHub.cs and CoachIntentOrchestrator.cs only.')
print('BACKUP:', backup)
print('UNCHANGED: AiChatService, Coach Runtime, AI Plan, Member Chatbox, DB schema.')

#!/usr/bin/env python3
"""Exercise dry run, apply, idempotence and protected source preservation on a fixture."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
installer = root / 'tools/install_coach_datahub_v12_v13.py'
with tempfile.TemporaryDirectory() as temp:
    repo = Path(temp)
    services = repo / 'backend/SportHub.AI/Application/Services'
    services.mkdir(parents=True)
    original = ('internal static class CoachIntentOrchestrator {\n'
                'internal static async Task<Result?> TryAnswerAsync() {}\n'
                '// COACH_STUDENT_METRICS_V11\n'
                'CoachStudentMetricAnalysis.IsMetricQuestion(question);\n}')
    (services/'CoachIntentOrchestrator.cs').write_text(original, encoding='utf-8')
    (services/'CoachStudentMetricAnalysis.cs').write_text('// fixture\n', encoding='utf-8')
    (services/'AiChatService.cs').write_text(
        '// COACH_INTENT_ORCHESTRATOR_V10\nCoachIntentOrchestrator.TryAnswerAsync(\n', encoding='utf-8')
    (services/'ClassTeachingAiController.cs').write_text('// PROTECTED AI PLAN\n', encoding='utf-8')
    (services/'MemberPortalChat.cs').write_text('// PROTECTED MEMBER\n', encoding='utf-8')
    safe_files = {p.name: p.read_bytes() for p in [services/'AiChatService.cs',services/'ClassTeachingAiController.cs',services/'MemberPortalChat.cs']}
    for flags, token in [([], 'DRY RUN PASS'),(['--apply'],'APPLIED'),(['--apply'],'ALREADY APPLIED')]:
        r = subprocess.run([sys.executable, str(installer), '--repo', str(repo), *flags],
                           capture_output=True, text=True)
        assert r.returncode == 0 and token in r.stdout, (r.stdout, r.stderr)
    assert (services/'CoachDataHub.cs').is_file()
    assert (services/'CoachIntentOrchestrator.cs').read_text(encoding='utf-8') != original
    assert len(list(services.glob('*.before-datahub-v13-*.bak'))) == 1
    for name, data in safe_files.items():
        assert (services/name).read_bytes() == data
print('PASS installer dry-run, apply, idempotence, and protected files')

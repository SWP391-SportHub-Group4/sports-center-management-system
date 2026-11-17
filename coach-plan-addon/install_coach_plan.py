#!/usr/bin/env python3
"""Install/verify/rollback the Coach Plan-only patch. No credentials or database access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone

ADDON = Path(__file__).resolve().parent
PAYLOAD = ADDON / 'payload'
EXPECTED = {
    'backend/SportHub.AI/Api/ClassTeachingAiController.cs',
    'frontend/src/features/coaching/teaching-editor.tsx',
    'frontend/src/features/coaching/teaching-api.ts',
    'backend/SportHub.Scheduling.Tests/Unit/CoachPlanContextTests.cs',
    'backend/SportHub.Scheduling.Tests/Integration/CoachPlanContextIntegrationTests.cs',
    *('backend/SportHub.AI/Application/Services/CoachPlanning/' + n + '.cs' for n in (
        'CoachPlanContextReader', 'CoachPlanOutputGuard', 'LessonHistoryAggregator',
        'PersonalPlanContextBuilder', 'PlanContextBudget', 'SessionPlanContextBuilder', 'TrainingProgressAnalyzer')),
}
V37 = 'backend/SportHub.AI/Application/Services/MemberGeminiWorkoutGeneratorV32.cs'
V37_SHA = 'a501909fb59b79be0efb8cea7e402bbb43d499a6f3f9651b481fc7d778960048'
PROTECTED = [V37, 'backend/SportHub.AI/Application/Services/WorkoutRecommendationService.cs',
    'ai-service/app/services/gemini_service.py', 'ai-service/app/services/gemini_model_router.py',
    'ai-service/app/services/member_chat_service.py', 'ai-service/app/services/coach_chat_service.py',
    'frontend/src/app/member/workout-suggestions/page.tsx', 'flow5-live-tests/Program.cs',
    'scripts/run-flow5-live-tests.ps1']

def digest(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()

def safe(root, rel):
    path = root / rel
    path.resolve().relative_to(root.resolve())
    cur = path
    while cur != root:
        if cur.is_symlink():
            raise RuntimeError('Symbolic links are not permitted: ' + rel)
        cur = cur.parent
    if path.exists() and not path.is_file():
        raise RuntimeError('Not a regular file: ' + rel)
    return path

def content(path):
    return path.read_bytes() if path.exists() else None

def hashfile(path):
    data = content(path)
    return None if data is None else digest(data)

def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(data)
        name = temp.name
    try:
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def preflight(root, manifest):
    if set(manifest) != EXPECTED:
        raise RuntimeError('Invalid manifest scope.')
    if not (root / 'backend/SportHub.AI/SportHub.AI.csproj').is_file():
        raise RuntimeError('Run from the SportHub repository root.')
    states = {}
    for rel, spec in sorted(manifest.items()):
        if hashfile(safe(PAYLOAD, rel)) != spec['after']:
            raise RuntimeError('Payload hash mismatch: ' + rel)
        current = hashfile(safe(root, rel))
        if current == spec['after']:
            states[rel] = 'ALREADY_APPLIED'
        elif current == spec['before']:
            states[rel] = 'READY'
        else:
            states[rel] = 'CONFLICT'
    for rel, state in states.items():
        print(state, rel)
    if 'CONFLICT' in states.values():
        raise RuntimeError('Unknown local source revision. No changes made. Preserve local edits and reconcile the diff first.')
    return states

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--rollback', metavar='BACKUP_ID')
    parser.add_argument('--require-v37', action='store_true', help='Require the exact original V37 generator hash before proceeding')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    manifest = json.loads((ADDON / 'manifest.json').read_text(encoding='utf-8'))
    if set(manifest) != EXPECTED:
        raise RuntimeError('Invalid manifest scope.')
    protected_before = {rel: content(safe(root, rel)) for rel in PROTECTED}
    v37 = protected_before[V37]
    matched = v37 is not None and digest(v37) == V37_SHA
    print('Member generator V37:', 'MATCH' if matched else 'MISSING/DIFFERENT (will not modify)')
    if args.require_v37 and not matched:
        raise RuntimeError('Exact V37 generator is not installed. No changes made.')
    if args.rollback:
        if not re.fullmatch(r'[0-9]{8}T[0-9]{6}[0-9]{6}Z', args.rollback):
            raise RuntimeError('Invalid backup ID.')
        folder = ADDON / 'backups' / args.rollback
        folder.resolve().relative_to(ADDON.resolve())
        saved = json.loads((folder / 'backup.json').read_text(encoding='utf-8'))
        if saved.get('root') != str(root) or not set(saved['files']).issubset(EXPECTED):
            raise RuntimeError('Backup belongs to another root or scope.')
        # Check all hashes before writing/removing anything.
        previous = {}
        for rel, spec in saved['files'].items():
            if spec != manifest[rel] or hashfile(safe(root, rel)) != spec['after']:
                raise RuntimeError('Rollback conflict: ' + rel + '. No changes made.')
            data = content(safe(folder / 'original', rel)) if spec['before'] is not None else None
            if (digest(data) if data is not None else None) != spec['before']:
                raise RuntimeError('Damaged backup: ' + rel)
            previous[rel] = data
        changed = []
        try:
            for rel, data in previous.items():
                dest = safe(root, rel)
                if data is None:
                    dest.unlink()
                else:
                    atomic_write(dest, data)
                changed.append(rel)
        except BaseException:
            for rel in reversed(changed):
                atomic_write(safe(root, rel), safe(PAYLOAD, rel).read_bytes())
            raise
        print('ROLLED_BACK', args.rollback, len(changed), 'files')
    else:
        states = preflight(root, manifest)
        if args.check:
            print('CHECK_OK; no source changes')
            return
        ready = [rel for rel, state in states.items() if state == 'READY']
        if not ready:
            print('ALREADY_INSTALLED; no changes')
            return
        backup_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        folder = ADDON / 'backups' / backup_id
        folder.resolve().relative_to(ADDON.resolve())
        folder.mkdir(parents=True, exist_ok=False)
        previous = {}
        for rel in ready:
            previous[rel] = content(safe(root, rel))
            if previous[rel] is not None:
                atomic_write(safe(folder / 'original', rel), previous[rel])
        (folder / 'backup.json').write_text(json.dumps({'root': str(root), 'files': {r: manifest[r] for r in ready}}, indent=2), encoding='utf-8')
        changed = []
        try:
            for rel in ready:
                # Refuse changes made after the original preflight, too.
                dest = safe(root, rel)
                if hashfile(dest) != manifest[rel]['before']:
                    raise RuntimeError('Concurrent source change: ' + rel)
                atomic_write(dest, safe(PAYLOAD, rel).read_bytes())
                changed.append(rel)
                if hashfile(dest) != manifest[rel]['after']:
                    raise RuntimeError('Post-install hash mismatch: ' + rel)
        except BaseException:
            for rel in reversed(changed):
                old = previous[rel]
                dest = safe(root, rel)
                if old is None:
                    dest.unlink()
                else:
                    atomic_write(dest, old)
            raise
        print('INSTALLED', len(changed), 'files. BACKUP_ID=' + backup_id)
    for rel, before in protected_before.items():
        if content(safe(root, rel)) != before:
            raise RuntimeError('Protected file changed concurrently: ' + rel)
    print('PROTECTED_UNCHANGED (Member V37, Flow5 runner, shared Python providers)')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        raise SystemExit('ERROR: ' + str(exc))

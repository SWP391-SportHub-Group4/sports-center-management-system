"""Apply four-project routing after the current-compatible Flow 6 patch."""
import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / 'manifest.json').read_text(encoding='utf-8'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path, help='SportHub repository root')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    states = {}
    for relative, hashes in MANIFEST.items():
        actual = digest(root / relative)
        state = 'READY' if actual == hashes['before'] else 'APPLIED' if actual == hashes['after'] else 'MISMATCH'
        states[relative] = state
        print(f'{state}: {relative}')
    if 'MISMATCH' in states.values():
        print('Files differ from the expected Flow 6 patch; nothing changed.', file=sys.stderr)
        return 2
    if args.check or all(state == 'APPLIED' for state in states.values()):
        return 0
    backup = root / '.sporthub-gemini-project-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for relative, state in states.items():
        if state == 'READY' and (root / relative).exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / relative, saved)
    for relative, state in states.items():
        if state != 'READY': continue
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        staged = target.with_name(target.name + '.four-projects-tmp')
        try:
            shutil.copy2(HERE / 'payload' / relative, staged)
            if digest(staged) != MANIFEST[relative]['after']:
                raise RuntimeError('Payload checksum mismatch: ' + relative)
            os.replace(staged, target)
        finally:
            staged.unlink(missing_ok=True)
    print('Applied; originals saved under:', backup)
    return 0

if __name__ == '__main__': sys.exit(main())

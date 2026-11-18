"""Apply the SportHub Flow 6 patch only to the exact reviewed source version."""
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
    parser.add_argument('--check', action='store_true', help='Check without modifying files')
    args = parser.parse_args()
    root = args.root.resolve()
    states = {}
    for relative, hashes in MANIFEST.items():
        target = root / relative
        actual = digest(target)
        state = 'READY' if actual == hashes['before'] else 'APPLIED' if actual == hashes['after'] else 'MISMATCH'
        states[relative] = state
        print(f'{state}: {relative}')
    if any(s == 'MISMATCH' for s in states.values()):
        print('Source differs from the reviewed develop(3) archive; no files changed.', file=sys.stderr)
        return 2
    if args.check:
        return 0
    if all(s == 'APPLIED' for s in states.values()):
        print('Patch already applied.')
        return 0
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = root / '.sporthub-flow6-chat-backups' / timestamp
    for relative, state in states.items():
        if state == 'READY':
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / relative, saved)
    for relative, state in states.items():
        if state == 'READY':
            target = root / relative
            staged = target.with_name(target.name + '.flow6-patch-tmp')
            try:
                shutil.copy2(HERE / 'payload' / relative, staged)
                if digest(staged) != MANIFEST[relative]['after']:
                    raise RuntimeError('Patch payload checksum mismatch: ' + relative)
                os.replace(staged, target)
            finally:
                staged.unlink(missing_ok=True)
    print('Applied. Originals saved at:', backup)
    return 0

if __name__ == '__main__':
    sys.exit(main())

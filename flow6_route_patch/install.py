import argparse, hashlib, pathlib, shutil, sys
from datetime import datetime, timezone
base = pathlib.Path(__file__).resolve().parent
p = argparse.ArgumentParser(); p.add_argument('--root', required=True); p.add_argument('--check', action='store_true'); a = p.parse_args()
root = pathlib.Path(a.root).resolve()
target = root / 'ai-service/tests/test_role_routes.py'
payload = base / 'payload/ai-service/tests/test_role_routes.py'
expected = (base / 'expected.sha256').read_text().strip()
if not target.is_file(): sys.exit('ERROR: target missing; --root must point to the project root.')
hashfile = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
actual = hashfile(target)
if actual == hashfile(payload):
    print('ALREADY APPLIED: ai-service/tests/test_role_routes.py'); sys.exit(0)
if actual != expected: sys.exit('MISMATCH: ai-service/tests/test_role_routes.py; no files changed.')
if a.check: print('READY: ai-service/tests/test_role_routes.py'); sys.exit(0)
backup = root / '.sporthub-route-test-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') / 'ai-service/tests/test_role_routes.py'
backup.parent.mkdir(parents=True, exist_ok=False)
shutil.copy2(target, backup)
shutil.copy2(payload, target)
print('APPLIED: ai-service/tests/test_role_routes.py')
print('BACKUP:', backup)

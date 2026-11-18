import argparse,hashlib,pathlib,shutil,sys
from datetime import datetime,timezone
base=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--check',action='store_true');a=p.parse_args();root=pathlib.Path(a.root).resolve();target=root/'flow6-live-tests/Program.cs';src=base/'payload/flow6-live-tests/Program.cs';expected=(base/'expected.sha256').read_text().strip()
def digest(f):return hashlib.sha256(f.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
if not target.is_file():sys.exit('MISSING: flow6-live-tests/Program.cs')
if digest(target)==digest(src):print('ALREADY APPLIED');sys.exit(0)
if digest(target)!=expected:sys.exit('MISMATCH: Program.cs; no files changed. Requires paced runner patch.')
print('READY: flow6-live-tests/Program.cs')
if a.check:sys.exit(0)
b=root/'.sporthub-evidence-runner-backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');b.mkdir(parents=True);shutil.copy2(target,b/'Program.cs');shutil.copy2(src,target);print('APPLIED; BACKUP:',b)

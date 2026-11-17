"""Install only the known V2.1 baseline; refuse local edits before writing."""
from pathlib import Path
import argparse, hashlib, json, shutil, datetime, sys
here=Path(__file__).resolve().parent
p=argparse.ArgumentParser(); p.add_argument('--root',default='.'); p.add_argument('--check',action='store_true'); p.add_argument('--rollback'); a=p.parse_args(); root=Path(a.root).resolve()
def hash_file(f): return hashlib.sha256(f.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
m=json.loads((here/'manifest.json').read_text()); required=json.loads((here/'required.json').read_text())
def target(p):
 f=root/p
 if not f.resolve().is_relative_to(root): raise SystemExit('Path outside root: '+p)
 return f
for path,h in required.items():
 f=target(path)
 if not f.is_file() or hash_file(f)!=h: raise SystemExit('Baseline conflict: '+path)
for path, h in m.items():
 f=target(path); src=here/'payload'/path
 if not src.is_file() or hash_file(src)!=h['after']: raise SystemExit('Invalid payload: '+path)
 if not f.is_file() or hash_file(f) not in (h['before'],h['after']): raise SystemExit('Baseline conflict: '+path)
if a.rollback:
 if Path(a.rollback).name!=a.rollback or a.rollback in ('.','..'): raise SystemExit('Invalid backup ID')
 backup=target('coach-plan-v2/backups-v22/'+a.rollback)
 for path,h in m.items():
  f=backup/path
  if not f.is_file() or hash_file(f) not in (h['before'],h['after']): raise SystemExit('Invalid backup: '+path)
  if hash_file(target(path))!=h['after']: raise SystemExit('Rollback conflict: '+path)
 for path in m: shutil.copyfile(backup/path,target(path))
 print('ROLLBACK_OK');sys.exit(0)
if a.check: print('CHECK_OK');sys.exit(0)
if all(hash_file(target(path))==h['after'] for path,h in m.items()): print('ALREADY_INSTALLED');sys.exit(0)
id=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'); backup=target('coach-plan-v2/backups-v22/'+id)
for path in m:
 f=backup/path; f.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(target(path),f)
try:
 for path in m: shutil.copyfile(here/'payload'/path,target(path))
 for path,h in m.items(): assert hash_file(target(path))==h['after'],path
except BaseException:
 for path in m: shutil.copyfile(backup/path,target(path))
 raise
print('INSTALL_OK; backup ID: '+id)

import argparse,hashlib,json,pathlib,shutil,sys
from datetime import datetime,timezone
base=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--check',action='store_true');a=p.parse_args();root=pathlib.Path(a.root).resolve();manifest=json.loads((base/'manifest.json').read_text());payload=base/'payload'; files=[x for x in payload.rglob('*') if x.is_file()];todo=[]
def digest(f):return hashlib.sha256(f.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
for src in files:
 rel=src.relative_to(payload);name=rel.as_posix();target=root/rel
 if target.exists():
  if not target.is_file():sys.exit('MISMATCH: '+name)
  if digest(target)==digest(src):print('ALREADY APPLIED:',name);continue
  if name not in manifest or digest(target)!=manifest[name]:sys.exit('MISMATCH: '+name+'; no files changed.')
 elif name in manifest:sys.exit('MISSING: '+name+'; no files changed.')
 print('READY:',name);todo.append((src,target,rel))
if a.check or not todo:sys.exit(0)
b=root/'.sporthub-chat-error-backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');b.mkdir(parents=True)
for src,target,rel in todo:
 if target.exists():(b/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,b/rel)
for src,target,rel in todo:target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,target);print('APPLIED:',rel)
print('BACKUP:',b)

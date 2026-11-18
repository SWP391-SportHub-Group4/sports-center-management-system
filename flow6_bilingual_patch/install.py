import argparse,hashlib,json,pathlib,shutil,sys
from datetime import datetime,timezone
base=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--check',action='store_true');a=p.parse_args();root=pathlib.Path(a.root).resolve();m=json.loads((base/'manifest.json').read_text());todo=[]
def digest(p):return hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
for name,expected in m.items():
 target=root/'flow6-live-tests'/name; src=base/'payload/flow6-live-tests'/name
 if not target.is_file():sys.exit('MISSING: '+str(target)+'; no files changed.')
 h=digest(target)
 if h==digest(src):print('ALREADY APPLIED:',name)
 elif h==expected:print('READY:',name);todo.append((target,src))
 else:sys.exit('MISMATCH: '+str(target)+'; no files changed.')
if a.check or not todo:sys.exit(0)
backup=root/'.sporthub-flow6-test-backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');backup.mkdir(parents=True)
for target,src in todo:shutil.copy2(target,backup/target.name)
for target,src in todo:shutil.copy2(src,target);print('APPLIED:',target.name)
print('BACKUP:',backup)

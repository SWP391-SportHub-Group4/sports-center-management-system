import argparse, hashlib, json, os, re, tempfile
from pathlib import Path
from datetime import datetime, timezone
A=Path(__file__).resolve().parent
M=json.loads((A/'manifest.json').read_text())
V='backend/SportHub.AI/Application/Services/MemberGeminiWorkoutGeneratorV32.cs'
VHASH='a501909fb59b79be0efb8cea7e402bbb43d499a6f3f9651b481fc7d778960048'
def sha(b): return None if b is None else hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest()
def safe(root,rel):
 p=root/rel; p.resolve().relative_to(root.resolve()); cur=p
 while cur!=root:
  if cur.is_symlink(): raise RuntimeError('Symlink: '+rel)
  cur=cur.parent
 if p.exists() and not p.is_file(): raise RuntimeError('Not file: '+rel)
 return p
def read(p): return p.read_bytes() if p.exists() else None
def write(p,b):
 if b is None: p.unlink(missing_ok=True); return
 p.parent.mkdir(parents=True,exist_ok=True)
 fd,n=tempfile.mkstemp(dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f: f.write(b)
  os.replace(n,p)
 finally:
  if os.path.exists(n): os.unlink(n)
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',default='.'); g=ap.add_mutually_exclusive_group(); g.add_argument('--check',action='store_true'); g.add_argument('--rollback'); args=ap.parse_args(); r=Path(args.root).resolve()
 allowed={ 'backend/SportHub.AI/Api/ClassTeachingAiController.cs','frontend/src/features/coaching/teaching-editor.tsx','backend/SportHub.Scheduling.Tests/Unit/CoachPlanContextTests.cs','backend/SportHub.Scheduling.Tests/Integration/CoachPlanContextIntegrationTests.cs', *('backend/SportHub.AI/Application/Services/CoachPlanning/'+n+'.cs' for n in ('CoachPlanGenerator','CoachPlanOutputGuard','CoachPlanContextReader','LessonHistoryAggregator','PersonalPlanContextBuilder','PlanContextBudget','SessionPlanContextBuilder','TrainingProgressAnalyzer'))}
 if set(M)!=allowed: raise RuntimeError('Manifest scope mismatch')
 if sha(read(safe(r,V)))!=VHASH: raise RuntimeError('V37 exact hash mismatch; no changes')
 print('Member V37: MATCH')
 # V1 frontend mapping is required and retained unchanged.
 api='frontend/src/features/coaching/teaching-api.ts'
 if sha(read(safe(r,api)))!='e8227d32b68f16af6a5c71cc7b985d02fad0e66c10f3b55bd1cc9db390f1c489': raise RuntimeError('V1 teaching-api.ts mismatch; no changes')
 if args.rollback:
  if not re.fullmatch(r'\d{8}T\d{12}Z',args.rollback): raise RuntimeError('Invalid backup ID')
  d=A/'backups'/args.rollback; meta=json.loads((d/'backup.json').read_text());
  if meta['root']!=str(r) or not set(meta['files'])<=allowed: raise RuntimeError('Backup scope mismatch')
  changes={}
  for rel,h in meta['files'].items():
   p=safe(r,rel); old=read(safe(d/'original',rel)); cur=read(p)
   if sha(old)!=h or h not in M[rel]['before'] or sha(cur)!=M[rel]['after']: raise RuntimeError('Rollback conflict: '+rel)
   changes[rel]=(cur,old)
 else:
  changes={}
  for rel,s in M.items():
   cur=read(safe(r,rel)); target=read(safe(A/'payload',rel)); h=sha(cur)
   if sha(target)!=s['after']: raise RuntimeError('Payload integrity: '+rel)
   if h==s['after']: print('ALREADY',rel); continue
   if h not in s['before']: raise RuntimeError('CONFLICT: '+rel+'; no changes')
   changes[rel]=(cur,target); print('READY',rel)
  if args.check: print('CHECK_OK'); return
  if not changes: print('ALREADY_INSTALLED'); return
  bid=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'); d=A/'backups'/bid; d.mkdir(parents=True)
  for rel,(old,_) in changes.items():
   if old is not None: write(safe(d/'original',rel),old)
  (d/'backup.json').write_text(json.dumps({'root':str(r),'files':{rel:sha(old) for rel,(old,_) in changes.items()}},indent=2)); print('BACKUP_ID',bid)
 done=[]
 try:
  for rel,(old,new) in changes.items():
   p=safe(r,rel)
   if read(p)!=old: raise RuntimeError('Concurrent edit: '+rel)
   write(p,new); done.append(rel)
 except BaseException:
  for rel in reversed(done): write(safe(r,rel),changes[rel][0])
  raise
 assert sha(read(safe(r,V)))==VHASH
 print('ROLLED_BACK' if args.rollback else 'INSTALLED','Member V37 unchanged')
if __name__=='__main__': main()

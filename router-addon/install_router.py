import argparse, hashlib, json, shutil, pathlib, datetime
p=pathlib.Path(__file__).resolve().parent
ap=argparse.ArgumentParser(); ap.add_argument('--root',default='.'); ap.add_argument('--rollback',type=pathlib.Path); a=ap.parse_args()
root=pathlib.Path(a.root).resolve(); dest=root/'ai-service/app/services'
manifest=json.loads((p/'manifest.json').read_text()); names=list(manifest)+['gemini_model_router.py']
def digest(f): return hashlib.sha256(f.read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
if a.rollback:
    b=a.rollback.resolve()
    for n in names:
        if not (dest/n).exists() or digest(dest/n)!=digest(p/'payload'/n): raise SystemExit('Installed source differs; refusing rollback: '+n)
    for n in manifest:
        if digest(b/n)!=manifest[n]: raise SystemExit('Backup mismatch: '+n)
    for n in manifest: shutil.copy2(b/n,dest/n)
    (dest/names[-1]).unlink(); print('Rolled back source. Router config and counters retained.'); raise SystemExit(0)
for n in manifest:
    if not (dest/n).exists() or digest(dest/n)!=manifest[n]: raise SystemExit('Unknown source revision; no files changed: '+n)
if (dest/names[-1]).exists(): raise SystemExit('Router already exists; no files changed')
# Check time zone availability before touching source.
from zoneinfo import ZoneInfo
ZoneInfo('America/Los_Angeles')
b=root/('.flow5-router-backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')); b.mkdir()
for n in manifest: shutil.copy2(dest/n,b/n)
for n in names: shutil.copy2(p/'payload'/n,dest/n)
config=root/'ai-service/gemini-router.json'
if not config.exists(): shutil.copy2(p/'gemini-router.example.json',config)
print('Installed (disabled by default if config is new). Backup:',b)

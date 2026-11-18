import argparse, hashlib, json, shutil, datetime, pathlib, sys
P=pathlib.Path(__file__).resolve().parent

def hashdata(b): return hashlib.sha256(b.replace(b'\r\n',b'\n')).hexdigest()
def h(p): return hashdata(p.read_bytes()) if p.is_file() else None
def safe(root,name):
    p=root/name
    if not p.resolve().is_relative_to(root): raise ValueError('Path escapes root: '+name)
    return p

def main():
    a=argparse.ArgumentParser(); a.add_argument('--root',required=True); a.add_argument('--check',action='store_true'); a.add_argument('--rollback'); args=a.parse_args()
    root=pathlib.Path(args.root).resolve(); manifest=json.loads((P/'manifest.json').read_text())
    if not (root/'backend/SportHub.API/SportHub.API.csproj').is_file(): raise ValueError('Not SportHub repository')
    if args.rollback:
        backup=pathlib.Path(args.rollback).resolve(); saved=json.loads((backup/'restore.json').read_text()); records=saved['files']
        if saved['root']!=str(root): raise ValueError('Backup root mismatch')
        for name,old in records.items():
            if name not in manifest or h(safe(root,name))!=manifest[name]['target']: raise ValueError('Rollback conflict: '+name)
            if old is not None and h(safe(backup,name))!=old: raise ValueError('Backup hash mismatch: '+name)
        for name,old in records.items():
            dst=safe(root,name)
            if old is None: dst.unlink()
            else: shutil.copy2(safe(backup,name),dst)
        print('ROLLBACK_OK'); return
    changes={}
    for name,m in manifest.items():
        dst=safe(root,name); src=safe(P/'payload',name)
        if h(src)!=m['target']: raise ValueError('Payload corrupt: '+name)
        actual=h(dst)
        if dst.exists() and not dst.is_file(): raise ValueError('Not a file: '+name)
        if actual==m['target']: continue
        if actual!=m['baseline']: raise ValueError('Source conflict: '+name)
        changes[name]=actual
    print(f'Validated {len(manifest)} paths; {len(changes)} changes')
    if args.check: print('CHECK_OK'); return
    if not changes: print('INSTALL_OK (already installed)'); return
    backup=root.parent/'SportHub_Flow6_Backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'); backup.mkdir(parents=True)
    for name,old in changes.items():
        if old is not None:
            dst=safe(backup,name); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(safe(root,name),dst)
    (backup/'restore.json').write_text(json.dumps({'root':str(root),'files':changes},indent=2))
    applied=[]
    try:
        for name in changes:
            dst=safe(root,name); dst.parent.mkdir(parents=True,exist_ok=True); applied.append(name); shutil.copy2(safe(P/'payload',name),dst)
    except Exception:
        for name in reversed(applied):
            dst=safe(root,name)
            if changes[name] is None: dst.unlink(missing_ok=True)
            else: shutil.copy2(safe(backup,name),dst)
        raise
    print('INSTALL_OK'); print('BACKUP:',backup)
if __name__=='__main__':
    try: main()
    except Exception as e: print('ERROR:',e,file=sys.stderr); sys.exit(1)

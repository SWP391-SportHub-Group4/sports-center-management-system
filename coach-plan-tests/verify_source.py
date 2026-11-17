"""Read-only hash preflight. No file modifications."""
import argparse, hashlib, json, pathlib, sys
p=argparse.ArgumentParser();p.add_argument('--root',default='.');a=p.parse_args();root=pathlib.Path(a.root).resolve();expected=json.loads(pathlib.Path(__file__).with_name('expected-hashes.json').read_text());failed=0
for name,accepted in expected.items():
    f=root/name
    if not f.is_file(): status='MISSING'
    elif hashlib.sha256(f.read_bytes().replace(b'\r\n',b'\n')).hexdigest() not in accepted: status='DIFFERENT'
    else: status='MATCH'
    print(status,name);failed+=status!='MATCH'
print('CHECK_OK' if not failed else 'CHECK_FAILED: inspect local changes; do not overwrite automatically.')
sys.exit(1 if failed else 0)

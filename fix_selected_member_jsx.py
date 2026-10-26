from pathlib import Path
import re, shutil, sys
root=Path(__file__).resolve().parent
path=root/'frontend/src/features/receptionist/selected-member.tsx'
if not path.is_file():sys.exit('NOT APPLIED: Run from repository root beside frontend/.')
s=path.read_text(encoding='utf-8')
correct='{!activationPending && <MemberSupportRequests memberId={memberId} />}'
if correct in s:
    print('ALREADY FIXED: selected-member.tsx')
    sys.exit(0)
lines=s.splitlines(keepends=True)
hits=[i for i,l in enumerate(lines) if 'MemberSupportRequests memberId={memberId}' in l]
if len(hits)!=1:sys.exit(f'NOT APPLIED: Expected exactly one MemberSupportRequests invocation, found {len(hits)}.')
i=hits[0]
line=lines[i]
if not ('!activationPending' in line and '!member.activationPending' in line):
    sys.exit('NOT APPLIED: JSX differs from the reported broken expression. No changes made.')
# Only replace the entire malformed expression line. Avoid arbitrary edits outside this line.
indent=re.match(r'\s*',line).group()
lines[i]=indent+correct+('\r\n' if line.endswith('\r\n') else '\n' if line.endswith('\n') else '')
new=''.join(lines)
if new.count(correct)!=1:sys.exit('NOT APPLIED: Postcondition failed.')
backup=path.with_name(path.name+'.bak-before-jsx-repair')
shutil.copy2(path,backup)
path.write_text(new,encoding='utf-8')
print('FIXED:',path.relative_to(root))
print('BACKUP:',backup.relative_to(root))
print('VERIFY: cd frontend; npm run lint; npm run typecheck; npm run build')

#!/usr/bin/env python3
"""Evidence-based frontend inventory, limited to Member/Coach, stdlib only.
Never infer permission or a multi-step workflow from route/button text alone.
Usage: python tools/build_member_coach_knowledge.py --repo . --output tools/generated
"""
import argparse
import json
import re
from pathlib import Path

BASE_ROLES=("member","coach")
APPROVED_SHARED={"/account","/notifications"}

def route_for(page, app):
    parts=page.relative_to(app).parts[:-1]
    return "/"+"/".join(parts)

def resolve_imports(text, source, frontend_src):
    result=[]
    for target in re.findall(r'from\s+["\']([^"\']+)["\']',text):
        if target.startswith('@/'):
            base=frontend_src/target[2:]
        elif target.startswith('.'):
            base=source.parent/target
        else:
            continue
        for candidate in (base.with_suffix('.tsx'),base.with_suffix('.ts'),base/'index.tsx',base/'index.ts'):
            if candidate.is_file() and candidate.resolve().is_relative_to(frontend_src.resolve()):
                result.append(candidate)
                break
    return result

def collect_connected(page, src, maxdepth=3, maxfiles=100):
    visited=set(); pending=[(page,0)]
    while pending and len(visited)<maxfiles:
        p,depth=pending.pop(0)
        if p in visited or not p.is_file():continue
        visited.add(p)
        if depth>=maxdepth:continue
        content=p.read_text(encoding='utf-8',errors='replace')
        for child in resolve_imports(content,p,src):
            if child not in visited:pending.append((child,depth+1))
    return sorted(visited)

def detect_ui(content):
    labels=[]
    # Only capture literal UI strings; JS expressions are not verified labels.
    patterns=[r'<button\b[^>]*>\s*([^<>}{]{2,90})\s*</button>',
              r'aria-label=["\']([^"\']{2,90})["\']',
              r'<(?:Tabs\.Trigger|Tab|option)\b[^>]*>\s*([^<>}{]{2,90})\s*</(?:Tabs\.Trigger|Tab|option)>']
    for pattern in patterns:
        for v in re.findall(pattern,content,re.I|re.S):
            v=' '.join(v.split())
            if v and v not in labels:labels.append(v)
    return labels[:100]

def inspect_route(route,page,src):
    connected=collect_connected(page,src)
    actions=[]; api=[]
    for f in connected:
        t=f.read_text(encoding='utf-8',errors='replace')
        ref=f.relative_to(src.parent).as_posix()
        for label in detect_ui(t):
            key=(label,ref)
            if not any((a['label'],a['source'])==key for a in actions):
                actions.append({'label':label,'source':ref,'verification':'literal_label_in_connected_source','handler_traced':False})
        for method,path in re.findall(r'\b(fetch|post|get|put|patch|delete)\s*\(\s*[`"\']([^`"\']*/api/[^`"\']+)[`"\']',t,re.I):
            api.append({'method':method.upper(),'path':path,'source':ref,'verification':'literal_api_reference_not_role_permission'})
    return {'route':route,'role':route.split('/')[1] if route.startswith(('/member','/coach')) else 'shared',
        'page_source':page.relative_to(src.parent).as_posix(),
        'reachable_source_files':len(connected),
        'ui_label_candidates':actions[:100],
        'api_reference_candidates':list({(x['method'],x['path'],x['source']):x for x in api}.values())[:100],
        'verification':'route_exists; labels_not_full_workflow; api_not_authorization'}

def make(repo):
    frontend=repo/'frontend'; src=frontend/'src'; app=src/'app'
    if not app.exists():raise SystemExit('Missing frontend/src/app; run from repository root')
    pages=sorted(app.rglob('page.tsx'))
    entries=[]
    for page in pages:
        route=route_for(page,app)
        if route=='/member' or route.startswith('/member/') or route=='/coach' or route.startswith('/coach/') or route in APPROVED_SHARED:
            entries.append(inspect_route(route,page,src))
    return {'schema_version':1,'scope':['member','coach'],'sources':['frontend routes','connected frontend components'],
      'limitations':['No automatic RBAC determination','Button labels may be nested in conditional components','API calls via clients may not contain literal paths','Workflow step sequence requires confirmation'],
      'entries':entries}

def main():
    p=argparse.ArgumentParser();p.add_argument('--repo',default='.');p.add_argument('--output',default='tools/generated');p.add_argument('--check',action='store_true');a=p.parse_args()
    repo=Path(a.repo).resolve();out=Path(a.output)
    if not out.is_absolute():out=repo/out
    result=make(repo)
    data=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    dest=out/'member_coach_source_evidence.json'
    if a.check:
        if not dest.exists() or dest.read_text(encoding='utf-8')!=data:
            raise SystemExit('Knowledge index is stale. Regenerate and review changed actions.')
        print('PASS: knowledge index up to date')
    else:
        out.mkdir(parents=True,exist_ok=True);dest.write_text(data,encoding='utf-8')
        total=sum(len(x['ui_label_candidates']) for x in result['entries'])
        print(f"Generated {len(result['entries'])} routes and {total} candidate label references, Member/Coach/shared only")
if __name__=='__main__':main()

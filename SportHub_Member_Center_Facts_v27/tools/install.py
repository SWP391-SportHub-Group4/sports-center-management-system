#!/usr/bin/env python3
"""V27 surgical Member-only changes, preserving later fixes in existing V26 source."""
import argparse, pathlib, shutil, sys, hashlib
from datetime import datetime, timezone
ap=argparse.ArgumentParser()
ap.add_argument('--repo',default='.')
ap.add_argument('--apply',action='store_true')
a=ap.parse_args()
repo=pathlib.Path(a.repo).resolve(); pkg=pathlib.Path(__file__).resolve().parents[1]
services=repo/'backend/SportHub.AI/Application/Services'
hub=services/'MemberGeminiDataHubV26.cs'
validator=services/'MemberWorkoutContextV26.cs'
new=services/'MemberCenterFactsV27.cs'
newsrc=pkg/'backend/SportHub.AI/Application/Services/MemberCenterFactsV27.cs'
router=services/'MemberIntentOrchestrator.cs'; ctl=repo/'backend/SportHub.AI/Api/AiController.cs'
if not all(p.is_file() for p in [hub,validator,router,ctl,newsrc]):sys.exit('REFUSED: v26 source or v27 package incomplete')
if router.read_text(encoding='utf-8-sig').count('MemberGeminiDataHubV26.TryAnswerAsync')!=1 or ctl.read_text(encoding='utf-8-sig').count('MemberWorkoutContextV26.EnsureValidAsync')!=1:
    sys.exit('REFUSED: expected v26 Member hooks are missing or duplicated')
s=hub.read_text(encoding='utf-8-sig'); v=validator.read_text(encoding='utf-8-sig')

def once(text, old, replacement, desc):
    if text.count(old)!=1: raise RuntimeError('REFUSED: changed source anchor for '+desc)
    return text.replace(old,replacement,1)

if 'MemberCenterFactsV27.SportsAsync' in s or new.exists():
    if new.exists() and 'MemberCenterFactsV27.SportsAsync' in s and 'MemberCenterFactsV27.PlansAsync' in s:
        print('ALREADY INSTALLED: V27 Member facts; no changes');sys.exit(0)
    sys.exit('REFUSED: partial/modified V27 installation')
try:
    s=once(s, '"overview", "account", "fitness", "membership", "myClasses",', '"overview", "account", "fitness", "membership", "sports", "myClasses",', 'allowed topics')
    s=once(s, 'Topics: overview, account, fitness, membership, myClasses,', 'Topics: overview, account, fitness, membership, sports, myClasses,', 'planner topics')
    s=once(s,'For sport and court questions choose courtRental and/or explorePackages.', 'For all center sports choose sports. For rental-enabled sports and rooms choose courtRental; do not conflate the two.', 'sport intent')
    s=once(s,'For detailed class content use classPlans.', 'For detailed class content use classPlans. For saved workout plans, exercises and AI suggestions use training.', 'training intent')
    s=once(s,'"membership" => await MemberReadOnlyGateway.LoadEvidenceAsync(db, id, MemberEvidenceDomain.Membership, utc, ct),', '"membership" => await MemberReadOnlyGateway.LoadEvidenceAsync(db, id, MemberEvidenceDomain.Membership, utc, ct),\n        "sports" => await MemberCenterFactsV27.SportsAsync(db, id, ct),', 'sports tool')
    s=once(s,'"training" => await MemberReadOnlyGateway.LoadEvidenceAsync(db, id, MemberEvidenceDomain.Training, utc, ct),', '"training" => await MemberCenterFactsV27.PlansAsync(db, id, ct),', 'training tool')
    if 'using SportHub.BuildingBlocks.Abstractions.Scheduling;' not in s:
        s='using SportHub.BuildingBlocks.Abstractions.Scheduling;\n'+s
    v=once(v, 'catch (Exception) { throw Unavailable(); }\n            if (TryParseDecision(response.Answer, out decision, out field)) break;',
      'catch (Exception) when (attempt == 0 && !ct.IsCancellationRequested)\n            {\n                // Transient provider failure: one bounded retry, never bypass semantic validation.\n                continue;\n            }\n            catch (Exception) { throw Unavailable(); }\n            if (TryParseDecision(response.Answer, out decision, out field)) break;', 'provider retry')
    v=once(v,'            using var doc = JsonDocument.Parse(raw);', '''            // Tolerate a single JSON object surrounded by provider explanatory prose,
            // but still strictly validate decision, field, and reason below.
            if (!raw.StartsWith("{", StringComparison.Ordinal))
            {
                var start = raw.IndexOf('{');
                var end = raw.LastIndexOf('}');
                if (start < 0 || end <= start || end - start > 3000) return false;
                raw = raw[start..(end + 1)];
            }
            using var doc = JsonDocument.Parse(raw);''','JSON envelope')
    v=once(v, '            VALID only when provided declarations are understandable, appropriately placed and',
      '''            Both a meaningful food declaration AND goal information may be present.
            Do not reject valid food merely because the member also has a meaningful goal.
            An actual exercise limitation can also be present; an empty limitation field is not required.
            VALID only when provided declarations are understandable, appropriately placed and''','semantics prompt')
except RuntimeError as exc: sys.exit(str(exc))

protected=[repo/'backend/SportHub.AI/Api/ClassTeachingAiController.cs', services/'AiPlanGoalGuard.cs',services/'CoachChatRuntime.cs',services/'CoachDataHub.cs',services/'CoachIntentOrchestrator.cs',services/'AiChatService.cs']
checks={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in protected if p.exists()}
print('DRY RUN PASS: 2 surgical Member V26 updates + 1 new Member facts file.')
print('Protected Coach AI Plan, Coach Chatbox, shared entrypoint, Manager prompts and DB schema: UNCHANGED.')
if not a.apply:sys.exit(0)
backups=[]
try:
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')
    for p in [hub,validator]:
        b=p.with_name(p.name+'.before-v27-'+stamp+'.bak')
        shutil.copy2(p,b);backups.append((p,b))
    hub.write_text(s,encoding='utf-8');validator.write_text(v,encoding='utf-8');new.write_bytes(newsrc.read_bytes())
    for p,old in checks.items():
        if hashlib.sha256(p.read_bytes()).hexdigest()!=old:raise RuntimeError('protected source changed')
except Exception:
    if new.exists():new.unlink()
    for p,b in backups:shutil.copy2(b,p)
    raise
for _,b in backups:print('BACKUP:',b)
print('APPLIED Member-only v27; no Coach/Plan/shared sources changed.')

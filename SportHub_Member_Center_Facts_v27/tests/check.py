from pathlib import Path
p=Path(__file__).resolve().parents[1]
root=p/'backend/SportHub.AI/Application/Services'
s=(root/'MemberCenterFactsV27.cs').read_text(encoding='utf-8')
h=(root/'MemberGeminiDataHubV26.cs').read_text(encoding='utf-8')
v=(root/'MemberWorkoutContextV26.cs').read_text(encoding='utf-8')
tests={
 'member identity verified': 'RequireMemberAsync(db, memberId, ct)' in s,
 'sports catalog full': 'db.Set<Sport>().AsNoTracking()' in s and 's.IsActive' in s,
 'sport offering flags': 'SportServiceOffering' in s,
 'sport count exact': 'exactActiveSportCount' in s,
 'coach training plans scoped': 'p.MemberId == memberId' in s,
 'plan item details': 'i.Exercise' in s and 'i.Sets' in s,
 'AI suggestion log scoped': 'x.UserId == memberId' in s,
 'no raw SQL': all(k not in s for k in ['FromSqlRaw','ExecuteSqlRaw','ExecuteSqlInterpolated']),
 'only read queries new facts': all(k not in s for k in ['SaveChanges','ExecuteUpdate','ExecuteDelete','db.Add(', 'db.Set<AiLog>().Add(']),
 'planner includes sports': '"sports"' in h,
 'sports routed via member facts': 'MemberCenterFactsV27.SportsAsync' in h,
 'training routed via member facts': 'MemberCenterFactsV27.PlansAsync' in h,
 'no fake live rental prices': 'does NOT give live price' in h,
 'member workout uses gemini': 'provider.AskAsync' in v,
 'workout provider retry': 'Transient provider failure' in v,
 'backend validates decision JSON': 'TryParseDecision' in v,
 'workout still fails closed': 'if (attempt == 1) throw Unavailable()' in v,
 'coach and plan not rewritten': not list(p.rglob('*CoachChatRuntime*')) and not list(p.rglob('*ClassTeachingAiController*')),
}
for k,x in tests.items(): print(('PASS' if x else 'FAIL'),k)
if not all(tests.values()): raise SystemExit(1)
print(f'PASS {len(tests)}/{len(tests)} static checks. NOT a .NET or live Gemini test.')

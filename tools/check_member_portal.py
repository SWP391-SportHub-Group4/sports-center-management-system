from pathlib import Path
p=Path(__file__).resolve().parents[1]
source=(p/'backend/SportHub.AI/Application/Services/MemberPortalChat.cs').read_text(encoding='utf-8')
checks={
 'Member auth from db': 'u.Role.RoleName == UserRole.Member' in source,
 'Member-only own account': 'u.UserId == uid' in source,
 'Member-only own packages': 'p.MemberId == uid' in source,
 'Member-only own training': 'x.MemberId == uid' in source,
 'No arbitrary sql': 'FromSqlRaw' not in source and 'ExecuteSql' not in source,
 'No Coach query': 'CoachDataScope' not in source,
 'No AI Plan': 'ClassTeachingAiController' not in source,
 'Overview': 'Your next session starts here' in source,
 'Account': 'Save profile' in source,
 'Fitness': 'Get AI Workout Suggestions' in source,
 'Registration': 'Explore packages' in source,
 'Read-only': 'db.Set<MemberTrainingProfile>().AsNoTracking()' in source,
}
for n,ok in checks.items():print(('PASS' if ok else 'FAIL')+' '+n)
assert all(checks.values()), 'static test failed'

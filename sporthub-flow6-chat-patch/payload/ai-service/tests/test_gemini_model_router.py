import sys, pathlib, tempfile, json, unittest, datetime
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from app.services.gemini_model_router import ModelRouter
class Upstream(Exception):
    def __init__(self, code): self.code=code
class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        p=pathlib.Path(self.tmp.name); self.cfg=p/'config.json'; self.now=1700000000
        self.r=ModelRouter(self.cfg,p/'db',lambda:self.now)
        self.cfg.write_text(json.dumps(dict(enabled=True,project_scope='test',threshold_percent=90,daily_limits={'a':10,'b':100},fallback_models=['b'])))
    def test_threshold_persistence(self):
        for _ in range(9): self.assertEqual(self.r.run('a',True,str),('a','a'))
        self.assertEqual(ModelRouter(self.cfg,self.r.db,lambda:self.now).run('a',True,str),('b','b'))
        self.now+=86400; self.assertEqual(self.r.run('a',True,str),('a','a'))
    def test_daily(self):
        def call(m):
            if m=='a': raise Upstream('ai_quota_exceeded') from Exception('GenerateRequestsPerDay')
            return m
        self.assertEqual(self.r.run('a',True,call),('b','b'))
        self.assertEqual(self.r.run('a',True,str),('b','b'))
    def test_503(self):
        def call(m):
            if m=='a': raise Upstream('ai_provider_unavailable')
            return m
        self.assertEqual(self.r.run('a',True,call),('b','b'))
        self.now+=16; self.assertEqual(self.r.run('a',True,str),('a','a'))
    def test_auth(self):
        with self.assertRaises(Upstream): self.r.run('a',True,lambda m: (_ for _ in ()).throw(Upstream('ai_provider_auth_failed')))
    def test_other_flow(self):
        for _ in range(10): self.assertEqual(self.r.run('a',False,str),('a','a'))
        self.assertEqual(self.r.run('a',True,str),('b','b'))
    def test_flow6_rate_limit_uses_fallback(self):
        attempted=[]
        def call(model):
            attempted.append(model)
            if model=='a': raise Upstream('ai_quota_exceeded')
            return model
        self.assertEqual(self.r.run('a',False,call,flow6=True),('b','b'))
        self.assertEqual(attempted,['a','b'])
        self.assertEqual(self.r.run('a',False,call,flow6=True),('b','b'))
        self.assertEqual(attempted,['a','b','b'])
    def test_flow6_respects_local_threshold(self):
        for _ in range(9): self.assertEqual(self.r.run('a',False,str,flow6=True),('a','a'))
        self.assertEqual(self.r.run('a',False,str,flow6=True),('b','b'))
    def test_flow6_does_not_mask_auth_failure(self):
        attempted=[]
        def call(model):
            attempted.append(model)
            raise Upstream('ai_provider_auth_failed')
        with self.assertRaises(Upstream): self.r.run('a',False,call,flow6=True)
        self.assertEqual(attempted,['a'])
    def test_disabled(self):
        self.cfg.write_text('{"enabled":false}')
        self.assertEqual(self.r.run('a',True,str),('a','a')); self.assertFalse(self.r.db.exists())
if __name__=='__main__': unittest.main()


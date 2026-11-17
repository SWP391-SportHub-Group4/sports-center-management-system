import unittest, tempfile, pathlib, json, threading, subprocess, sys, os
from http.server import HTTPServer, BaseHTTPRequestHandler
from unittest.mock import patch
import run
GOOD='Warm-up · 2 sets × 10 reps of shoulder mobility.\nFootwork · 3 sets × 10 reps of lateral stepping.\nGrip · 2 sets × 10 reps of controlled swings.\nCool-down · 1 set × 5 reps of calf stretches.'
class Tests(unittest.TestCase):
    def test_matrix(self):
        c=run.cases(); self.assertEqual(len(c),50);self.assertEqual(len({x['id'] for x in c}),50)
        self.assertEqual(sum(x['http']==200 for x in c),14)
    def test_format(self):
        self.assertEqual(run.validate_plan(GOOD,'session'),[])
        self.assertTrue(run.validate_plan(GOOD.replace('2 sets','0 sets',1),'session'))
        self.assertTrue(run.validate_plan(GOOD.replace('10 reps','-1 reps',1),'personal'))
        self.assertTrue(run.validate_plan(GOOD.replace('Warm-up ·','Warm-up:'),'session'))
        self.assertTrue(run.validate_plan(GOOD.replace('Warm-up','- Warm-up'),'session'))
        self.assertTrue(run.validate_plan('No exercise','personal'))
        self.assertEqual(run.validate_plan(GOOD.replace('sets','hiệp').replace('set','hiệp').replace('reps','lần'),'session'),[])
    def test_verdict(self):
        unhappy=run.cases()[0]; happy=run.cases()[-1]
        self.assertEqual(run.evaluate(unhappy,400,{'error':'suggestion_context_invalid'},[])[0],'PASS')
        self.assertEqual(run.evaluate(unhappy,400,{'error':'other'},[])[0],'FAIL')
        self.assertEqual(run.evaluate(unhappy,200,{'content':GOOD},[])[0],'FAIL')
        self.assertEqual(run.evaluate(unhappy,503,{'error':'ai_provider_rate_limited'},[])[0],'INFRA_ERROR')
        self.assertEqual(run.evaluate(happy,502,{'error':'ai_suggestion_invalid_output'},[])[0],'FAIL')
        self.assertEqual(run.evaluate(happy,500,{},[])[0],'FAIL')
        result={'content':GOOD,'model':'gemini-3.5-flash-lite','provider':'Python AI Service / Coach Plan'}
        self.assertEqual(run.evaluate(happy,200,result,['gemini-3.5-flash-lite'])[0],'PASS')
        self.assertEqual(run.evaluate(happy,200,result,['other'])[0],'FAIL')
        self.assertEqual(run.evaluate(happy,200,{'content':GOOD,'model':'mock','provider':'mock'},[])[0],'FAIL')
    def test_redaction(self):
        self.assertEqual(run.sanitized('x test-secret y',['test-secret']),'x [REDACTED] y')
    def test_reports(self):
        with tempfile.TemporaryDirectory() as t:
            path=pathlib.Path(t)/'report'; run.reports([dict(id='CP-001',title='test <x>',group='LOCAL',status='FAIL',elapsedMs=1,reason='test')],path)
            self.assertEqual({p.name for p in path.iterdir()},{'results.json','results.csv','junit.xml','index.html'})
            self.assertIn('&lt;x&gt;',(path/'index.html').read_text())
            self.assertEqual(json.loads((path/'results.json').read_text())['counts'],{'FAIL':1})
    def test_http_transport(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                if self.path=='/redirect':
                    self.send_response(302);self.send_header('Location','https://example.invalid/');self.end_headers();return
                if self.headers.get('Authorization')!='Bearer synthetic': self.send_response(401);self.end_headers();return
                data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                self.send_response(400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'error':'suggestion_context_invalid','scope':data['scope']}).encode())
            def log_message(self,*a): pass
        with HTTPServer(('127.0.0.1',0),Handler) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                base='http://127.0.0.1:'+str(server.server_port)
                self.assertEqual(run.call(base,{'scope':'session'},'synthetic',2),(400,{'error':'suggestion_context_invalid','scope':'session'}))
                self.assertEqual(run.call(base,{},'',2)[0],401)
                self.assertEqual(run.call(base+'/redirect',{},'synthetic',2)[0],302)
            finally: server.shutdown();thread.join()
if __name__=='__main__': unittest.main()

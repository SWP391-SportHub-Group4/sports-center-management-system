"""Offline role route contracts, isolated from other test modules."""
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

if '--child' in sys.argv:
    import types
    from unittest.mock import patch
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    fake = types.ModuleType('app.services.gemini_service')
    class GeminiUpstreamError(Exception):
        def __init__(self, status_code, code, message):
            self.status_code, self.code, self.message = status_code, code, message
            super().__init__(message)
    class GeminiService:
        calls = []
        def generate_with_model(self, *, system_prompt, user_prompt, **kwargs):
            self.calls.append((system_prompt, user_prompt, kwargs))
            return ('fake answer', 'fallback-test-model')
    fake.GeminiUpstreamError = GeminiUpstreamError
    fake.GeminiService = GeminiService
    sys.modules['app.services.gemini_service'] = fake
    from app.api import member, coach
    app = FastAPI()
    app.include_router(member.router)
    app.include_router(coach.router)
    client = TestClient(app)

    class RouteContracts(unittest.TestCase):
        def setUp(self):
            GeminiService.calls.clear()
            self.body = {'systemPrompt': 'test prompt', 'context': 'authorized-data', 'question': 'test question'}

        def test_profiles_and_actual_model(self):
            cases = [('/member/chat', 'member_chat', False, True, 'MEMBER_QUESTION'),
                     ('/coach/chat', 'coach_chat', False, True, 'COACH_CHAT'),
                     ('/coach/plan', 'plan', True, False, 'COACH_TEACHING_PLAN_REVIEW')]
            for path, profile, flow5, flow6, marker in cases:
                with self.subTest(path=path):
                    result = client.post(path, json=self.body)
                    self.assertEqual(result.status_code, 200)
                    self.assertEqual(result.json()['answer'], 'fake answer')
                    self.assertEqual(result.json()['model'], 'fallback-test-model')
                    prompt, user, opts = GeminiService.calls[-1]
                    self.assertEqual(prompt, self.body['systemPrompt'])
                    self.assertIn(marker, user)
                    self.assertIn('authorized-data', user)
                    self.assertEqual((opts['profile'], opts['flow5'], opts['flow6']), (profile, flow5, flow6))
            self.assertEqual(client.post('/member/plan', json=self.body).status_code, 404)

        def test_suggestion_profile(self):
            for prompt in ('You create a MEMBER SELF-SERVICE SPORTSHUB', 'You are reviewing a proposed fitness workout', 'You validate a MEMBER SELF-SERVICE SportHub workout profile'):
                with self.subTest(prompt=prompt):
                    result = client.post('/member/chat', json={**self.body, 'systemPrompt': prompt})
                    self.assertEqual(result.status_code, 200)
                    opts = GeminiService.calls[-1][2]
                    self.assertEqual((opts['profile'], opts['flow5'], opts['flow6']), ('suggestion', True, False))

        def test_continuation_and_validation(self):
            result = client.post('/member/chat', json={**self.body, 'previousInteractionId': 'existing-id'})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()['interactionId'], 'existing-id')
            self.assertEqual(client.post('/coach/chat', json={'question': 'test'}).status_code, 422)

        def test_sanitized_errors(self):
            for path, service in [('/member/chat', member.service), ('/coach/chat', coach.service), ('/coach/plan', coach.service)]:
                with self.subTest(path=path), patch.object(service, 'ask', side_effect=GeminiUpstreamError(504, 'ai_provider_timeout', 'safe timeout')):
                    result = client.post(path, json=self.body)
                    self.assertEqual(result.status_code, 504)
                    self.assertEqual(result.json()['detail']['code'], 'ai_provider_timeout')
                with self.subTest(path=path), patch.object(service, 'ask', side_effect=RuntimeError('sensitive-detail')):
                    result = client.post(path, json=self.body)
                    self.assertEqual(result.status_code, 502)
                    self.assertNotIn('sensitive-detail', result.text)

    if __name__ == '__main__':
        unittest.main(argv=[sys.argv[0]])
else:
    class RoleRouteProcessTests(unittest.TestCase):
        def test_isolated_route_contracts(self):
            env = os.environ.copy()
            env['GEMINI_API_KEY'] = 'offline-test-placeholder'
            result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--child'], cwd=str(ROOT), env=env, text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + '\n' + result.stderr)
            self.assertIn('Ran 4 tests', result.stderr)

    if __name__ == '__main__':
        unittest.main()

"""Offline unit tests for sanitized Gemini errors and isolated AI routes.

Run: python -m unittest discover -s tests -p 'test_upstream_error_v29.py' -v
No live Gemini credentials or pytest installation needed.
"""
import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


class AiUpstreamContractTests(unittest.TestCase):
    def setUp(self):
        fake_google = types.ModuleType("google")
        fake_google.__path__ = []
        fake_genai = types.ModuleType("google.genai")
        fake_genai.__path__ = []

        class APIError(Exception):
            def __init__(self, code):
                super().__init__("untrusted-provider-error")
                self.code = code

        class DummyModels:
            to_raise = None
            response = types.SimpleNamespace(text="safe result")

            def generate_content(self, **kwargs):
                if self.to_raise:
                    raise self.to_raise
                return self.response

        self.models = DummyModels()
        self.APIError = APIError
        fake_genai.Client = lambda **kwargs: types.SimpleNamespace(models=self.models)
        fake_genai.types = types.SimpleNamespace(
            HttpOptions=lambda **kwargs: kwargs,
            GenerateContentConfig=lambda **kwargs: kwargs,
        )
        fake_genai.errors = types.SimpleNamespace(APIError=APIError)
        fake_google.genai = fake_genai
        modules = ["google", "google.genai", "app.core.config", "app.services.gemini_service",
                   "app.services.coach_chat_service", "app.services.member_chat_service",
                   "app.api.coach", "app.api.member"]
        self.original_modules = {m: sys.modules.get(m) for m in modules}
        for name in modules:
            sys.modules.pop(name, None)
        sys.modules["google"] = fake_google
        sys.modules["google.genai"] = fake_genai
        self.env = patch.dict(os.environ, {"GEMINI_API_KEY": "test-key-for-offline-contract"})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        for module, previous in self.original_modules.items():
            if previous is None:
                sys.modules.pop(module, None)
            else:
                sys.modules[module] = previous

    def test_gemini_error_categories_are_sanitized(self):
        gemini = importlib.import_module("app.services.gemini_service")
        service = gemini.GeminiService()
        self.assertEqual(service.generate("trusted", "untrusted"), "safe result")
        for status, code in [(429, "ai_quota_exceeded"), (401, "ai_provider_auth_failed"),
                             (404, "ai_model_unavailable"), (504, "ai_provider_timeout"),
                             (503, "ai_provider_unavailable")]:
            self.models.to_raise = self.APIError(status)
            with self.assertRaises(gemini.GeminiUpstreamError) as raised:
                service.generate("trusted", "untrusted")
            self.assertEqual(raised.exception.code, code)
            self.assertNotIn("untrusted-provider-error", raised.exception.message)
        self.models.to_raise = None
        self.models.response = types.SimpleNamespace(text=None)
        with self.assertRaises(gemini.GeminiUpstreamError) as raised:
            service.generate("trusted", "untrusted")
        self.assertEqual(raised.exception.code, "ai_provider_empty_answer")

    def test_role_routes_preserve_safe_status_without_leaking_provider(self):
        error = importlib.import_module("app.services.gemini_service").GeminiUpstreamError
        coach = importlib.import_module("app.api.coach")
        member = importlib.import_module("app.api.member")
        app = FastAPI()
        app.include_router(coach.router)
        app.include_router(member.router)
        payload = {"question": "hi", "context": "{}", "systemPrompt": "safe"}
        for route in ["/coach/chat", "/coach/plan", "/member/chat"]:
            service = coach.service if route.startswith("/coach") else member.service

            def fail(*args, **kwargs):
                raise error(504, "ai_provider_timeout", "The AI provider did not respond in time.")

            with patch.object(service, "ask", side_effect=fail):
                response = TestClient(app).post(route, json=payload)
            self.assertEqual(response.status_code, 504)
            self.assertEqual(response.json()["detail"]["code"], "ai_provider_timeout")
            self.assertNotIn("untrusted", response.text)


if __name__ == "__main__":
    unittest.main()

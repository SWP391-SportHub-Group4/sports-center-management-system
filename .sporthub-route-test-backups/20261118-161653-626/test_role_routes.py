"""Verifies route separation without calling Gemini, using a fake model dependency."""
import os
import sys
import types

os.environ.setdefault("GEMINI_API_KEY", "test-key-only")
from fastapi import FastAPI
from fastapi.testclient import TestClient

fake = types.ModuleType("app.services.gemini_service")


class FakeGeminiService:
    def generate(self, *, system_prompt: str, user_prompt: str) -> str:
        return "coach-output" if "COACH_QUESTION" in user_prompt else "member-output"


fake.GeminiService = FakeGeminiService
sys.modules["app.services.gemini_service"] = fake
from app.api.coach import router as coach_router  # noqa: E402
from app.api.member import router as member_router  # noqa: E402

app = FastAPI()
app.include_router(coach_router)
app.include_router(member_router)
client = TestClient(app)
body = {"systemPrompt": "test-only", "context": "authorized-data", "question": "test"}


def test_member_route_only_uses_member_wrapper():
    response = client.post("/member/chat", json=body)
    assert response.status_code == 200
    assert response.json()["answer"] == "member-output"


def test_coach_chat_and_plan_are_distinct_routes():
    for path in ("/coach/chat", "/coach/plan"):
        response = client.post(path, json=body)
        assert response.status_code == 200
        assert response.json()["answer"] == "coach-output"
    assert client.post("/member/plan", json=body).status_code == 404

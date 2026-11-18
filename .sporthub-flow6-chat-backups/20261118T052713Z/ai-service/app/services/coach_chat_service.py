"""Coach-only language-model runtime. No Member messages or member role selection."""
from uuid import uuid4

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.gemini_service import GeminiService


class CoachChatService:
    def __init__(self) -> None:
        self.gemini = GeminiService()

    def ask(self, request: ChatRequest, *, plan: bool = False) -> ChatResponse:
        # .NET already checks Coach JWT + scoped class/student access. No DB access here.
        # Distinct endpoints and section delimiters prevent a Member prompt from being
        # accidentally treated as a Coach request by a shared prompt wrapper.
        task = "COACH_TEACHING_PLAN_REVIEW" if plan else "COACH_CHAT"
        user_prompt = (
            f"{task}\n\nSPORT_HUB_COACH_CONTEXT\n\n{request.context}"
            f"\n\nEND_SPORT_HUB_COACH_CONTEXT\n\nCOACH_QUESTION\n\n{request.question}"
            "\n\nEND_COACH_QUESTION"
        )
        answer = self.gemini.generate(
            system_prompt=request.systemPrompt,
            user_prompt=user_prompt,
        )
        return ChatResponse(
            interactionId=request.previousInteractionId or str(uuid4()),
            answer=answer,
            provider="Python AI Service / Coach Plan" if plan else "Python AI Service / Coach",
            model=settings.gemini_model,
        )

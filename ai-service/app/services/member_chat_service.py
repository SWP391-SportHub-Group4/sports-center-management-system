from uuid import uuid4

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.gemini_service import GeminiService


class MemberChatService:
    def __init__(self) -> None:
        self.gemini = GeminiService()

    def ask(
        self,
        request: ChatRequest,
    ) -> ChatResponse:
        user_prompt = f"""
SPORT_HUB_CONTEXT

{request.context}

END_SPORT_HUB_CONTEXT

MEMBER_QUESTION

{request.question}

END_MEMBER_QUESTION
"""

        answer = self.gemini.generate(
            system_prompt=request.systemPrompt,
            user_prompt=user_prompt,
        )

        return ChatResponse(
            interactionId=(
                request.previousInteractionId
                or str(uuid4())
            ),
            answer=answer,
            provider="Python AI Service",
            model=settings.gemini_model,
        )
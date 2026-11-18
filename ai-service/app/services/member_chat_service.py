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

        is_flow5 = request.systemPrompt.startswith((
            "You create a MEMBER SELF-SERVICE SPORTSHUB",
            "You are reviewing a proposed fitness workout",
            "You validate a MEMBER SELF-SERVICE SportHub workout profile",
        ))
        answer, model = self.gemini.generate_with_model(
            system_prompt=request.systemPrompt,
            user_prompt=user_prompt,
            flow5=is_flow5,
            flow6=not is_flow5,
            profile="suggestion" if is_flow5 else "member_chat",
        )

        return ChatResponse(
            interactionId=(
                request.previousInteractionId
                or str(uuid4())
            ),
            answer=answer,
            provider="Python AI Service",
            model=model,
        )

import logging

from fastapi import (
    APIRouter,
    HTTPException,
)

from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
)
from app.services.member_chat_service import (
    MemberChatService,
)


router = APIRouter(
    prefix="/member",
    tags=["Member AI"],
)

service = MemberChatService()
logger = logging.getLogger("sporthub.ai.member")


@router.post(
    "/chat",
    response_model=ChatResponse,
)
def chat(
    request: ChatRequest,
) -> ChatResponse:
    try:
        return service.ask(
            request
        )

    except Exception as exc:
        logger.exception("Member AI Gemini generation failed")
        raise HTTPException(
            status_code=502,
            detail="AI chat generation failed.",
        ) from exc
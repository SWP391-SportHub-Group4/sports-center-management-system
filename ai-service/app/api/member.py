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
        raise HTTPException(
            status_code=502,
            detail="AI chat generation failed.",
        ) from exc
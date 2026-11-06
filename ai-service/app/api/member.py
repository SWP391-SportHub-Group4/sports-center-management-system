"""Internal Member chat endpoint; .NET enforces the Member JWT and evidence scope."""
import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.member_chat_service import MemberChatService
from app.services.gemini_service import GeminiUpstreamError

router = APIRouter(prefix="/member", tags=["Member AI"])
service = MemberChatService()
logger = logging.getLogger("sporthub.ai.member")


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        return service.ask(request)
    except GeminiUpstreamError as exc:
        logger.warning("Member AI upstream failure: code=%s", exc.code)
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    except Exception as exc:
        logger.error("Member AI unexpected failure: type=%s", type(exc).__name__)
        raise HTTPException(status_code=502, detail={"code": "ai_provider_generation_failed", "message": "The AI provider could not complete the request."}) from exc

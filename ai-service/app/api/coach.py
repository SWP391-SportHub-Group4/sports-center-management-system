"""Internal endpoints selected only after .NET validates the Coach JWT and scope."""
import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.coach_chat_service import CoachChatService
from app.services.gemini_service import GeminiUpstreamError

router = APIRouter(prefix="/coach", tags=["Coach AI"])
service = CoachChatService()
logger = logging.getLogger("sporthub.ai.coach")


def _answer(request: ChatRequest, *, plan: bool) -> ChatResponse:
    try:
        return service.ask(request, plan=plan)
    except GeminiUpstreamError as exc:
        logger.warning("Coach AI upstream failure: route=%s code=%s", "plan" if plan else "chat", exc.code)
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    except Exception as exc:
        logger.error("Coach AI unexpected failure: route=%s type=%s", "plan" if plan else "chat", type(exc).__name__)
        raise HTTPException(status_code=502, detail={"code": "ai_provider_generation_failed", "message": "The AI provider could not complete the request."}) from exc


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    return _answer(request, plan=False)


@router.post("/plan", response_model=ChatResponse)
def plan(request: ChatRequest) -> ChatResponse:
    return _answer(request, plan=True)

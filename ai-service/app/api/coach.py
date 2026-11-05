"""Only .NET authorized Coach flows should invoke these internal AI service paths."""
import logging
from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.coach_chat_service import CoachChatService

router = APIRouter(prefix="/coach", tags=["Coach AI"])
service = CoachChatService()
logger = logging.getLogger("sporthub.ai.coach")


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        return service.ask(request)
    except Exception as exc:
        logger.exception("Coach chat Gemini generation failed")
        raise HTTPException(status_code=502, detail="Coach chat generation failed.") from exc


@router.post("/plan", response_model=ChatResponse)
def plan(request: ChatRequest) -> ChatResponse:
    try:
        return service.ask(request, plan=True)
    except Exception as exc:
        logger.exception("Coach teaching-plan Gemini generation failed")
        raise HTTPException(status_code=502, detail="Coach plan generation failed.") from exc

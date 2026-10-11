from pydantic import BaseModel


class ChatRequest(BaseModel):
    systemPrompt: str
    context: str
    question: str
    previousInteractionId: str | None = None


class ChatResponse(BaseModel):
    interactionId: str | None = None
    answer: str
    provider: str
    model: str
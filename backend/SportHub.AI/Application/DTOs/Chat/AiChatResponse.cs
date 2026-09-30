namespace SportHub.AI.Application.DTOs.Chat;

public sealed record AiChatResponse(
    Guid LogId,
    string InteractionId,
    string Question,
    string Answer,
    string Provider,
    string Model,
    string PromptVersion,
    int ResponseTimeMs,
    DateTime CreatedAt);
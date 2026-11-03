namespace SportHub.AI.Application.DTOs.Chat;

public sealed record AiChatRequest(
    string Question,
    string? PreviousInteractionId = null);
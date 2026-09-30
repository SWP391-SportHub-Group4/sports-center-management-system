namespace SportHub.AI.Application.DTOs.Chat;

public sealed record AiProviderResponse(
    string InteractionId,
    string Answer,
    string Provider,
    string Model);
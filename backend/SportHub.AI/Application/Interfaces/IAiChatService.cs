using SportHub.AI.Application.DTOs.Chat;

namespace SportHub.AI.Application.Interfaces;

public interface IAiChatService
{
    Task<AiChatResponse> AskAsync(
        Guid userId,
        string question,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default);
}
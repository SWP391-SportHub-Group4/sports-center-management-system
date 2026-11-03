using SportHub.AI.Application.DTOs.Chat;

namespace SportHub.AI.Application.Interfaces;

public interface IAiChatProvider
{
    Task<AiProviderResponse> AskAsync(
        string systemPrompt,
        string context,
        string question,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default);
}
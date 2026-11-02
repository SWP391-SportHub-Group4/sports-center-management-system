namespace SportHub.AI.Application.Interfaces;

public sealed record PublishedSystemPrompt(string Content, string Version);
public interface ISystemPromptReader
{
    Task<PublishedSystemPrompt> GetPublishedAsync(string role, CancellationToken ct = default);
}

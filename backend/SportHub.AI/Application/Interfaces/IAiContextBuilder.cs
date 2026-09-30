namespace SportHub.AI.Application.Interfaces;

public interface IAiContextBuilder
{
    Task<string> BuildAsync(
        Guid userId,
        string question,
        CancellationToken cancellationToken = default);
}
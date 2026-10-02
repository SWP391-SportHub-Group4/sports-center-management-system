namespace SportHub.BuildingBlocks.Abstractions.Audit;

/// <summary>Reads the caller's receipt without exposing other actors' audit records.</summary>
public interface IAuditReader
{
    Task<string?> FindNewValueAsync(Guid actorId, string action, string targetEntity, string targetId,
        CancellationToken cancellationToken = default);
}

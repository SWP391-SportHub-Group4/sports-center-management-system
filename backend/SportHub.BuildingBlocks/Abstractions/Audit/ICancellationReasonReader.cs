namespace SportHub.BuildingBlocks.Abstractions.Audit;

public interface ICancellationReasonReader
{
    Task<IReadOnlyDictionary<string, string>> ReadAsync(string targetEntity,
        IReadOnlyCollection<string> targetIds, CancellationToken ct = default);
}

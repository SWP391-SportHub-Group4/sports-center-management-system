namespace SportHub.BuildingBlocks.Abstractions.Wallet;

public interface IIncidentPointGiftService
{
    Task<int> GetMaxPointsAsync(CancellationToken ct = default);
    // Participates in the caller's incident transaction; recipients are validated against the current preview.
    Task ApplyAsync(Guid incidentId, Guid managerId, string reason,
        IReadOnlyList<IncidentPointGift> gifts, CancellationToken ct = default);
}

public sealed record IncidentPointGift(Guid MemberId, int Points);

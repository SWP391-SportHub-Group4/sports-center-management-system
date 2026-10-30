namespace SportHub.BuildingBlocks.Abstractions.Membership;

public interface IIncidentDayPassService
{
    Task<IReadOnlyList<IncidentDayPass>> FindAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
    Task CancelAsync(Guid passId, CancellationToken ct = default);
}

public sealed record IncidentDayPass(Guid PassId, Guid MemberId, Guid InvoiceItemId, DateOnly UseDate, string Status, DateTime? ExpiresAtUtc = null);

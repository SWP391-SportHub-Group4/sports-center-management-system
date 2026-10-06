namespace SportHub.BuildingBlocks.Abstractions.Reporting;

public sealed record RevenueDimension(int? SportId, string? SportName, Guid? MemberId = null);

/// <summary>Host joins report dimensions without introducing module dependency cycles.</summary>
public interface IRevenueDimensionReader
{
    Task<IReadOnlyDictionary<Guid, RevenueDimension>> ReadAsync(
        IReadOnlyCollection<Guid> invoiceItemIds, CancellationToken ct = default);
}

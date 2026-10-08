namespace SportHub.BuildingBlocks.Abstractions.Scheduling;

/// <summary>Read-only display details for invoices, including historical rentals.</summary>
public interface ICourtRentalDetailsReader
{
    Task<IReadOnlyList<CourtRentalDetails>> ReadAsync(IReadOnlyCollection<Guid> rentalIds, CancellationToken ct = default);
}

public sealed record CourtRentalDetails(Guid RentalId, string RoomName, string SportName,
    DateTime StartAtUtc, DateTime EndAtUtc);

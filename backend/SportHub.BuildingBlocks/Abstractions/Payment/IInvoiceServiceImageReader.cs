namespace SportHub.BuildingBlocks.Abstractions.Payment;

public sealed record InvoiceServiceImageReferences(
    IReadOnlyDictionary<Guid, int> MembershipPackages,
    IReadOnlyDictionary<Guid, int> RentalRooms);

/// <summary>Read-only bulk resolution of service owners, scoped to the invoice beneficiary.</summary>
public interface IInvoiceServiceImageReader
{
    Task<InvoiceServiceImageReferences> GetReferencesAsync(Guid beneficiaryId,
        IReadOnlyCollection<Guid> memberPackageIds, IReadOnlyCollection<Guid> rentalIds,
        CancellationToken ct = default);
}

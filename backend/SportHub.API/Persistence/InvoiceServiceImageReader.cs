using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Payment;

namespace SportHub.API.Persistence;

public sealed class InvoiceServiceImageReader(SportHubDbContext db) : IInvoiceServiceImageReader
{
    public async Task<InvoiceServiceImageReferences> GetReferencesAsync(Guid beneficiaryId,
        IReadOnlyCollection<Guid> memberPackageIds, IReadOnlyCollection<Guid> rentalIds, CancellationToken ct = default)
    {
        var packages = memberPackageIds.Count == 0 ? new Dictionary<Guid, int>() : await db.MemberPackages.AsNoTracking()
            .Where(x => memberPackageIds.Contains(x.MemberPackageId) && x.MemberId == beneficiaryId)
            .Select(x => new { x.MemberPackageId, x.PackageId }).ToDictionaryAsync(x => x.MemberPackageId, x => x.PackageId, ct);
        var rooms = rentalIds.Count == 0 ? new Dictionary<Guid, int>() : await db.CourtRentals.AsNoTracking()
            .Where(x => rentalIds.Contains(x.CourtRentalId) && x.MemberId == beneficiaryId)
            .Select(x => new { x.CourtRentalId, x.RoomId }).ToDictionaryAsync(x => x.CourtRentalId, x => x.RoomId, ct);
        return new(packages, rooms);
    }
}

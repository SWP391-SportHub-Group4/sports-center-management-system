using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Membership.Application.Services;

public sealed class MembershipAccessReader(ISportHubDbContext db) : IMembershipAccessReader
{
    public Task<MembershipDetails?> GetByIdAsync(Guid memberPackageId, CancellationToken cancellationToken = default)
        => db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberPackageId == memberPackageId)
            .Select(x => new MembershipDetails(x.MemberPackageId, x.MemberId, x.PackageId,
                x.StartDate, x.EndDate, x.Status.ToString())).SingleOrDefaultAsync(cancellationToken);

    public Task<MembershipAccess?> GetActiveAsync(Guid memberId, DateTimeOffset atUtc, CancellationToken cancellationToken = default)
    {
        var date = DateOnly.FromDateTime(VietnamTime.ToLocal(atUtc.UtcDateTime));
        return db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberId == memberId
            && x.Status == MemberPackageStatus.Active && x.StartDate <= date && x.EndDate >= date)
            .OrderBy(x => x.EndDate).ThenBy(x => x.MemberPackageId)
            .Select(x => new MembershipAccess(x.MemberPackageId, x.PackageId, x.StartDate, x.EndDate))
            .FirstOrDefaultAsync(cancellationToken);
    }
}

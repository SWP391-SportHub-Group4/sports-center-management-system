using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Rules;

namespace SportHub.Membership.Application.Services;

public sealed class MembershipAccessReader(ISportHubDbContext db, ISystemSettingProvider settings) : IMembershipAccessReader
{
    public Task<MembershipDetails?> GetByIdAsync(Guid memberPackageId, CancellationToken cancellationToken = default)
        => db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberPackageId == memberPackageId)
            .Select(x => new MembershipDetails(x.MemberPackageId, x.MemberId, x.PackageId,
                x.StartDate, x.EndDate, x.Status.ToString())).SingleOrDefaultAsync(cancellationToken);

    public async Task<MembershipAccess?> GetActiveAsync(Guid memberId, DateTimeOffset atUtc, CancellationToken cancellationToken = default)
    {
        var date = DateOnly.FromDateTime(VietnamTime.ToLocal(atUtc.UtcDateTime));
        var dayPassOpen = DayPassClock.IsOpen(atUtc.UtcDateTime, await CenterOperatingHours.ReadAsync(settings, cancellationToken));
        return await db.Set<MemberPackage>().AsNoTracking().Where(x => x.MemberId == memberId
            && x.Status == MemberPackageStatus.Active && x.StartDate <= date && x.EndDate >= date
            && (x.PackageId != DayPass.PackageId || dayPassOpen)
            && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > atUtc.UtcDateTime))
            .OrderBy(x => x.EndDate).ThenBy(x => x.MemberPackageId)
            .Select(x => new MembershipAccess(x.MemberPackageId, x.PackageId, x.StartDate, x.EndDate))
            .FirstOrDefaultAsync(cancellationToken);
    }
}

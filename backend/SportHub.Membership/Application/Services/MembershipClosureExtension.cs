using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Membership;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Membership.Domain;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;

namespace SportHub.Membership.Application.Services;

public sealed class MembershipClosureExtension(ISportHubDbContext db) : IMembershipClosureExtension
{
    public Task<int> CountAffectedMembersAsync(DateOnly closureStartLocal, CancellationToken cancellationToken = default)
        => db.Set<MemberPackage>().AsNoTracking()
            .Where(x => x.Status == MemberPackageStatus.Active && x.EndDate >= closureStartLocal
                        && x.PackageId != DayPass.PackageId)
            .Select(x => x.MemberId).Distinct().CountAsync(cancellationToken);

    public async Task<IReadOnlyList<ExtendedMembership>> ExtendActiveAsync(int days, DateOnly closureStartLocal,
        CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Membership closure extension requires the caller's transaction.");
        if (days <= 0) return [];

        var packages = await db.Set<MemberPackage>()
            .Include(x => x.Member)
            .Where(x => x.Status == MemberPackageStatus.Active && x.EndDate >= closureStartLocal
                        && x.PackageId != DayPass.PackageId)
            .OrderBy(x => x.MemberId).ThenBy(x => x.StartDate)
            .ToListAsync(cancellationToken);
        foreach (var package in packages)
        {
            // Gói đã bắt đầu giữ nguyên StartDate; gói nối tiếp chưa bắt đầu dời theo để chuỗi gia hạn không chồng lấn.
            if (package.StartDate > closureStartLocal) package.StartDate = package.StartDate.AddDays(days);
            package.EndDate = package.EndDate.AddDays(days);
        }

        return packages.GroupBy(x => x.MemberId)
            .Select(g => g.OrderByDescending(x => x.EndDate).First())
            .Select(x => new ExtendedMembership(x.MemberId, x.Member!.Email, x.MemberPackageId, x.EndDate))
            .ToList();
    }
}

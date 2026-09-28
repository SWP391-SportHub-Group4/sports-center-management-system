using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Application.DTOs;
using SportHub.Membership.Application.Interfaces;

namespace SportHub.Membership.Application.Services;

/// <summary>
/// Tổng quan hội viên theo dữ liệu Membership. Không đọc Payment/Invoice: số tiền đã chi
/// thuộc báo cáo doanh thu riêng của module Payment.
/// </summary>
public sealed class MembershipReportService(ISportHubDbContext db) : IMembershipReportService
{
    public async Task<MembershipSummaryResponse> GetSummaryAsync(
        DateOnly asOfDate,
        CancellationToken ct = default)
    {
        var totalMembers = await db.Set<UserAccount>()
            .AsNoTracking()
            .CountAsync(u => u.Role!.RoleName == UserRole.Member, ct);

        // Một Member có nhiều package Active vẫn chỉ được tính một lần. Status Active một
        // mình chưa đủ: ngày báo cáo phải nằm trong validity inclusive của package.
        var membersWithActiveMembership = await db.Set<MemberPackage>()
            .AsNoTracking()
            .Where(mp => mp.Status == MemberPackageStatus.Active
                         && mp.StartDate <= asOfDate
                         && mp.EndDate >= asOfDate
                         && mp.Member!.Role!.RoleName == UserRole.Member)
            .Select(mp => mp.MemberId)
            .Distinct()
            .CountAsync(ct);

        var counts = await db.Set<MemberPackage>()
            .AsNoTracking()
            .GroupBy(mp => mp.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Status, item => item.Count, ct);

        return new MembershipSummaryResponse(
            asOfDate,
            totalMembers,
            membersWithActiveMembership,
            totalMembers - membersWithActiveMembership,
            new MemberPackageStatusCountsResponse(
                counts.GetValueOrDefault(MemberPackageStatus.PendingPayment),
                counts.GetValueOrDefault(MemberPackageStatus.Active),
                counts.GetValueOrDefault(MemberPackageStatus.Expired),
                counts.GetValueOrDefault(MemberPackageStatus.Cancelled)));
    }
}

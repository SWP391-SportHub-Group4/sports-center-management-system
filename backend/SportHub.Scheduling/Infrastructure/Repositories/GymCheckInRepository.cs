using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Enums;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Domain.Exceptions;

namespace SportHub.Scheduling.Infrastructure.Repositories;

public sealed class GymCheckInRepository(ISportHubDbContext db) : IGymCheckInRepository
{
    // Đọc member_packages bằng SQL thô vì cần mệnh đề khóa FOR SHARE — LINQ không diễn đạt được.
    // Cột alias "Value": SqlQueryRaw<int> yêu cầu đúng tên đó cho kiểu vô hướng.
    private const string LockActivePackageSql = """
        SELECT 1 AS "Value"
        FROM member_packages
        WHERE member_id = {0} AND status = {1}
        LIMIT 1
        FOR SHARE
        """;

    public async Task CreateGuardedAsync(GymCheckIn checkIn, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Xác minh target đúng là Member — không cho Lễ tân ghi check-in cho Coach/Manager
        // hay cho một user id bất kỳ. Gộp "không tồn tại" và "không phải Member" vào cùng
        // một lỗi 404 để không lộ sự tồn tại của tài khoản khác.
        var isMember = await db.Set<UserAccount>()
            .AnyAsync(
                u => u.UserId == checkIn.MemberId && u.Role!.RoleName == UserRole.Member,
                cancellationToken);

        if (!isMember)
        {
            throw new MemberNotFoundException(checkIn.MemberId);
        }

        // BR-64: phải có >= 1 MemberPackage Active TẠI THỜI ĐIỂM check-in.
        //
        // FOR SHARE khóa chia sẻ đúng dòng gói vừa tìm được cho tới khi transaction này
        // commit: hai check-in song song vẫn chạy được cùng lúc (cùng khóa share), nhưng
        // một transaction khác muốn UPDATE dòng đó (vd đổi sang Cancelled/Expired) phải
        // đợi — nếu không có khóa thì ở mức READ COMMITTED, bản chụp lúc đọc vẫn thấy gói
        // Active trong khi nó đã bị hủy xong ngay sau đó, và check-in vẫn lọt.
        // Chỉ mở transaction thôi KHÔNG chặn được khe này.
        //
        // Cố ý chỉ xét Status: BR-64 không nói tới RemainingSessions > 0 hay end_date;
        // chuyển Active -> Expired khi hết hạn/hết buổi là việc của BR-11 (Design v2 §2.1),
        // không nhân bản điều kiện đó vào đây.
        var activePackages = await db.Database
            .SqlQueryRaw<int>(LockActivePackageSql, checkIn.MemberId, (int)MemberPackageStatus.Active)
            .ToListAsync(cancellationToken);

        if (activePackages.Count == 0)
        {
            throw new NoActiveMemberPackageException(checkIn.MemberId);
        }

        db.Set<GymCheckIn>().Add(checkIn);
        await db.SaveChangesAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<(IReadOnlyList<GymCheckIn> Items, int TotalCount)> GetHistoryAsync(
        Guid memberId,
        int skip,
        int take,
        CancellationToken cancellationToken = default)
    {
        var query = db.Set<GymCheckIn>()
            .AsNoTracking()
            .Where(c => c.MemberId == memberId);

        var totalCount = await query.CountAsync(cancellationToken);

        // CheckInId phá hòa: hai check-in cùng mốc thời gian vẫn phải có thứ tự ổn định,
        // nếu không thì phân trang có thể trả trùng/thiếu dòng giữa hai trang.
        var items = await query
            .OrderByDescending(c => c.CheckInTime)
            .ThenByDescending(c => c.CheckInId)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }
}

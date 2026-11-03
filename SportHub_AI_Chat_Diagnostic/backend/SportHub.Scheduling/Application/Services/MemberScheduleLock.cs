using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Khóa tư vấn theo Member để mua lớp và thuê sân của cùng một Member được kiểm tra trùng lịch tuần tự.
/// Khóa giữ đến hết giao dịch nên giao dịch sau chỉ kiểm tra khi giao dịch trước đã commit.
/// </summary>
internal static class MemberScheduleLock
{
    public static async Task AcquireAsync(ISportHubDbContext db, Guid memberId, CancellationToken ct)
    {
        // Ngoài giao dịch, khóa xact tự nhả ngay nên không có tác dụng; bỏ qua cho các lần chỉ xem báo giá.
        if (db.Database.CurrentTransaction is null) return;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"member-schedule:{memberId}"}, 0))", ct);
    }
}

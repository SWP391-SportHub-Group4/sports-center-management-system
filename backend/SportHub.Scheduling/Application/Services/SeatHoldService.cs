using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Application.Services;

public sealed record ExpiredSeatHold(Guid HoldId, int ClassId, Guid MemberId, Guid? InvoiceId);

/// <summary>
/// Hết hạn giữ chỗ (BR-115). Mỗi hold Active quá hạn chuyển Expired ĐÚNG MỘT LẦN và trả reserved_count tương ứng.
/// Chọn batch bằng <c>FOR UPDATE SKIP LOCKED</c> nên nhiều instance job (hoặc job đua với Release/Confirm) không xử lý trùng.
/// Trả danh sách hold vừa hết hạn để lớp Payment (chặng checkout) hủy Invoice và nhả điểm giữ tương ứng.
/// </summary>
public sealed class SeatHoldService(ISportHubDbContext db, IClock clock)
{
    public const int DefaultBatchSize = 200;

    public async Task<IReadOnlyList<ExpiredSeatHold>> ExpireDueAsync(int batchSize = DefaultBatchSize, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var ownTransaction = db.Database.CurrentTransaction is null;
        var tx = ownTransaction ? await db.Database.BeginTransactionAsync(ct) : null;

        try
        {
            var active = (int)SeatHoldStatus.Active;

            var due = await db.Set<SeatHold>()
                .FromSqlInterpolated($"""
                    SELECT * FROM seat_holds
                    WHERE status = {active} AND expires_at_utc <= {now}
                    ORDER BY expires_at_utc
                    LIMIT {batchSize}
                    FOR UPDATE SKIP LOCKED
                    """)
                .ToListAsync(ct);

            foreach (var group in due.GroupBy(h => h.ClassId).OrderBy(g => g.Key))
            {
                var count = group.Count();

                foreach (var hold in group)
                {
                    hold.Status = SeatHoldStatus.Expired;
                }

                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE classes SET reserved_count = reserved_count - {count}, version = version + 1 WHERE class_id = {group.Key} AND reserved_count - {count} >= confirmed_count",
                    ct);
            }

            if (due.Count > 0)
            {
                await db.SaveChangesAsync(ct);
            }

            if (tx is not null)
            {
                await tx.CommitAsync(ct);
            }

            return due.Select(h => new ExpiredSeatHold(h.HoldId, h.ClassId, h.MemberId, h.InvoiceId)).ToList();
        }
        finally
        {
            if (tx is not null)
            {
                await tx.DisposeAsync();
            }
        }
    }
}

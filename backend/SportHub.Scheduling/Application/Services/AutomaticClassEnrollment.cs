using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Scheduling.Application.Services;

internal static class AutomaticClassEnrollment
{
    public const string FullReason = "Class is full.";

    // Called in the withdrawal transaction while the class row is locked.
    // Temporary seat holds remain included in reserved_count and still prevent overbooking.
    public static Task<int> ReopenAfterWithdrawalAsync(ISportHubDbContext db, int classId, DateTime now, CancellationToken ct)
        => db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE classes c SET enrollment_open = TRUE, enrollment_closed_reason = NULL,
                enrollment_closed_at_utc = NULL, version = version + 1
            WHERE c.class_id = {classId} AND c.status = {(int)ClassStatus.Published}
                AND c.enrollment_closed_reason = {FullReason} AND c.confirmed_count < c.capacity
                AND EXISTS (SELECT 1 FROM class_sessions s WHERE s.class_id = c.class_id AND s.status != {(int)ClassSessionStatus.Cancelled})
                AND NOT EXISTS (SELECT 1 FROM class_sessions s WHERE s.class_id = c.class_id
                    AND s.status != {(int)ClassSessionStatus.Cancelled} AND s.start_at_utc <= {now})
            """, ct);
}

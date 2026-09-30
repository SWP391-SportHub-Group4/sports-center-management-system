using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Transaction-scoped scheduling barrier: reservations/fulfillment share it; timetable changes take it exclusively.
/// This closes the race between checking a member's schedule and moving another course, without serializing checkouts.
/// Always acquire before member/class/session/hold row locks. PostgreSQL releases it at transaction end.
/// </summary>
internal static class CourseScheduleLock
{
    public static Task AcquireAsync(ISportHubDbContext db, bool changingSchedule, CancellationToken ct)
        => changingSchedule
            ? db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 1)", ct)
            : db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock_shared(105, 1)", ct);
}

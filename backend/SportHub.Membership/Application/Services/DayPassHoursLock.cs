using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Membership.Application.Services;

public static class DayPassHoursLock
{
    // Lock before invoice/package rows: Settings takes an exclusive lock; purchases/check-in share it.
    public static Task AcquireAsync(ISportHubDbContext db, bool updatingHours = false, CancellationToken ct = default)
        => db.Database.ExecuteSqlRawAsync(updatingHours
            ? "SELECT pg_advisory_xact_lock(877459034)"
            : "SELECT pg_advisory_xact_lock_shared(877459034)", ct);
}

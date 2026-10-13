using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Application;

/// <summary>Bản cài đặt <see cref="ISchedulingAvailabilityReader"/>: đọc cùng bảng occupancy mà OccupancyService ghi.</summary>
public sealed class SchedulingAvailabilityReader(ISportHubDbContext db) : ISchedulingAvailabilityReader
{
    public async Task<IReadOnlyList<TimeWindow>> GetCoachBusyAsync(
        Guid coachId, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var from = DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc);
        var to = DateTime.SpecifyKind(toUtc, DateTimeKind.Utc);

        return await db.Set<CoachOccupancy>().AsNoTracking()
            .Where(o => o.IsActive && o.CoachId == coachId && o.StartAtUtc < to && o.EndAtUtc > from)
            .OrderBy(o => o.StartAtUtc)
            .Select(o => new TimeWindow(o.StartAtUtc, o.EndAtUtc))
            .ToListAsync(cancellationToken);
    }

}

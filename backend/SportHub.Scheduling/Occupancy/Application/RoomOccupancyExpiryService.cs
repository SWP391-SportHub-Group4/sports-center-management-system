using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Application;

/// <summary>Release elapsed room occupancy from every source, retaining all history.</summary>
public sealed class RoomOccupancyExpiryService(ISportHubDbContext db, IClock clock)
{
    public Task<int> ExpireAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        // Expire each interval independently. An ongoing or future interval in the
        // same room stays active. The conditional update also repairs missed runs.
        return db.Set<RoomOccupancy>()
            .Where(o => o.IsActive && o.EndAtUtc <= now)
            .ExecuteUpdateAsync(update => update.SetProperty(o => o.IsActive, false), ct);
    }
}

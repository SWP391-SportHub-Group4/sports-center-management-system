using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>Bản cài đặt <see cref="ISportCatalogReader"/>: chỉ đọc, dùng chung DbContext của caller.</summary>
public sealed class SportCatalogReader(ISportHubDbContext db) : ISportCatalogReader
{
    public async Task<SportInfo?> GetSportAsync(int sportId, CancellationToken cancellationToken = default)
        => await db.Set<Sport>()
            .AsNoTracking()
            .Where(s => s.SportId == sportId)
            .Select(s => new SportInfo(
                s.SportId,
                s.Name,
                s.OperationType.ToString(),
                s.IsActive,
                s.DefaultSessionMinutes ?? 0,
                s.DefaultMaxCapacity))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<RoomInfo?> GetRoomAsync(int roomId, CancellationToken cancellationToken = default)
        => await db.Set<Room>()
            .AsNoTracking()
            .Where(r => r.RoomId == roomId)
            .Select(r => new RoomInfo(r.RoomId, r.Name, r.RoomTypeId, r.IsActive, r.Capacity))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<bool> IsRoomCompatibleAsync(int roomId, int sportId, CancellationToken cancellationToken = default)
        => await (from room in db.Set<Room>().AsNoTracking()
                  join link in db.Set<SportRoomType>().AsNoTracking() on room.RoomTypeId equals link.RoomTypeId
                  join sport in db.Set<Sport>().AsNoTracking() on link.SportId equals sport.SportId
                  where room.RoomId == roomId && room.IsActive && sport.SportId == sportId && sport.IsActive
                  select 1)
            .AnyAsync(cancellationToken);

    public async Task<bool> IsRoomOpenAsync(int roomId, DateTimeOffset startUtc, DateTimeOffset endUtc, CancellationToken cancellationToken = default)
    {
        var start = VietnamTime.ToLocal(startUtc.UtcDateTime);
        var end = VietnamTime.ToLocal(endUtc.UtcDateTime);

        if (start.Date != end.Date)
        {
            return false;
        }

        var day = (int)start.DayOfWeek;
        var row = await db.Set<RoomOpeningHour>().AsNoTracking()
            .SingleOrDefaultAsync(h => h.RoomId == roomId && h.DayOfWeek == day, cancellationToken);

        return RoomOpeningHourService.Covers(row, start, end);
    }
}

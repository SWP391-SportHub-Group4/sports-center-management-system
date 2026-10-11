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
    {
        var sport = await db.Set<Sport>()
            .AsNoTracking()
            .Include(s => s.Services)
            .SingleOrDefaultAsync(s => s.SportId == sportId, cancellationToken);

        return sport is null ? null : ToInfo(sport);
    }

    public async Task<bool> IsServiceEnabledAsync(int sportId, SportServiceType serviceType, CancellationToken cancellationToken = default)
        => await db.Set<SportServiceOffering>()
            .AsNoTracking()
            .AnyAsync(o => o.SportId == sportId && o.ServiceType == serviceType && o.IsEnabled
                           && db.Set<Sport>().Any(s => s.SportId == o.SportId && s.IsActive), cancellationToken);

    public async Task<SportInfo?> GetSportForServiceAsync(SportServiceType serviceType, CancellationToken cancellationToken = default)
    {
        var sport = await db.Set<Sport>()
            .AsNoTracking()
            .Include(s => s.Services)
            .Where(s => s.IsActive && s.Services.Any(o => o.ServiceType == serviceType && o.IsEnabled))
            .OrderBy(s => s.SortOrder).ThenBy(s => s.SportId)
            .FirstOrDefaultAsync(cancellationToken);

        return sport is null ? null : ToInfo(sport);
    }

    public async Task<bool> IsRoomAllowedForServiceAsync(int roomId, SportServiceType serviceType, CancellationToken cancellationToken = default)
        => await (from room in db.Set<Room>().AsNoTracking()
                  join link in db.Set<ServiceRoomType>().AsNoTracking() on room.RoomTypeId equals link.RoomTypeId
                  join offering in db.Set<SportServiceOffering>().AsNoTracking() on link.OfferingId equals offering.OfferingId
                  join sport in db.Set<Sport>().AsNoTracking() on offering.SportId equals sport.SportId
                  where room.RoomId == roomId && room.IsActive
                        && offering.ServiceType == serviceType && offering.IsEnabled && sport.IsActive
                  select 1)
            .AnyAsync(cancellationToken);

    private static SportInfo ToInfo(Sport s)
    {
        var group = s.Services.FirstOrDefault(o => o.ServiceType == SportServiceType.GroupCourse);

        return new SportInfo(
            s.SportId,
            s.Code,
            s.Name,
            s.IsActive,
            s.Services.Select(o => new SportServiceInfo(o.ServiceType, o.IsEnabled, o.DefaultSessionMinutes, o.DefaultMaxCapacity, o.OfferingId)).ToList(),
            group?.DefaultSessionMinutes ?? 0,
            group?.DefaultMaxCapacity);
    }

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

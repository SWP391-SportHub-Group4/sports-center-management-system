using Microsoft.EntityFrameworkCore;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.API.Persistence;

/// <summary>Idempotent Development baseline; preserves room IDs and their existing bookings.</summary>
public sealed class FacilityBaselineSeeder(SportHubDbContext db)
{
    private sealed record Facility(string Name, int TypeId, int Capacity, params string[] LegacyNames);

    private static readonly Facility[] Baseline =
    [
        new("Badminton Class BC1", 3, 12, "Sân cầu lông 01", "Badminton court 01", "Badminton court 1"),
        new("Badminton Class BC2", 3, 12, "Sân cầu lông 02", "Badminton court 02"),
        new("Badminton Rental BR1", 3, 12),
        new("Badminton Rental BR2", 3, 12),
        new("Basketball Class KC1", 4, 20, "Sân bóng rổ 01", "Basketball court 01", "Basketball court 1"),
        new("Basketball Class KC2", 4, 20, "Sân bóng rổ 02", "Basketball court 02"),
        new("Basketball Rental KR1", 4, 20),
        new("Basketball Rental KR2", 4, 20),
        new("Gym G1", 1, 80, "Khu Gym tự do", "Open gym"),
        new("Gym G2", 1, 80)
    ];

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var rooms = await db.Rooms.ToListAsync(ct);
        foreach (var facility in Baseline)
        {
            var room = rooms.FirstOrDefault(r => r.Name == facility.Name);
            if (room is null)
            {
                room = rooms.FirstOrDefault(r =>
                    facility.LegacyNames.Contains(r.Name) &&
                    (r.RoomTypeId == facility.TypeId || r.RoomTypeId is null));
                if (room is null)
                {
                    room = new Room { Name = facility.Name, RoomTypeId = facility.TypeId,
                        Capacity = facility.Capacity };
                    db.Rooms.Add(room);
                    rooms.Add(room);
                }
                else
                {
                    room.Name = facility.Name;
                    room.RoomTypeId = facility.TypeId;
                }
                await db.SaveChangesAsync(ct);
            }

            if (!await db.RoomOpeningHours.AnyAsync(h => h.RoomId == room.RoomId, ct))
            {
                db.RoomOpeningHours.AddRange(Enumerable.Range(0, 7).Select(day =>
                    new RoomOpeningHour { RoomId = room.RoomId, DayOfWeek = day,
                        OpenTimeLocal = new TimeOnly(6, 0), CloseTimeLocal = new TimeOnly(22, 0) }));
                await db.SaveChangesAsync(ct);
            }
        }
    }
}

using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>
/// Phòng Gym theo <see cref="GymRooms"/> (cùng định nghĩa với IncidentService.ClosesGymAsync).
/// Gym đóng cửa khi mọi phòng Gym đều đang bị block.
/// </summary>
public sealed class GymClosureReader(ISportHubDbContext db) : IGymClosureReader
{
    public Task LockForActivationAsync(CancellationToken cancellationToken = default)
        => SportHub.Scheduling.Application.Services.CourseScheduleLock.AcquireAsync(db, changingSchedule: false, cancellationToken);

    public async Task<bool> IsGymClosedAtAsync(DateTime atUtc, CancellationToken cancellationToken = default)
    {
        var instant = DateTime.SpecifyKind(atUtc, DateTimeKind.Utc);
        var gymRoomIds = await GymRooms.ActiveRoomIds(db).ToListAsync(cancellationToken);
        if (gymRoomIds.Count == 0) return false;

        var blockedRoomIds = await db.Set<RoomBlock>().AsNoTracking()
            .Where(b => gymRoomIds.Contains(b.RoomId) && b.StartAtUtc <= instant && b.EndAtUtc > instant)
            .Select(b => b.RoomId).Distinct().ToListAsync(cancellationToken);
        return gymRoomIds.All(blockedRoomIds.Contains);
    }
}

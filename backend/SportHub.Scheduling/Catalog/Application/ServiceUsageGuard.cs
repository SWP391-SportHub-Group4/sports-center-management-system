using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Application;

/// <summary>Chặn gỡ loại phòng khỏi dịch vụ PT khi còn buổi PT tương lai trong phòng thuộc loại đó.</summary>
public sealed class ServiceUsageGuard(ISportHubDbContext db, IPersonalTrainingScheduleReader pt, IClock clock)
{
    public async Task RequireNoFuturePtInRoomTypesAsync(IReadOnlyCollection<int> roomTypeIds, CancellationToken ct)
    {
        if (roomTypeIds.Count == 0) return;
        var roomIds = await db.Set<Room>().AsNoTracking()
            .Where(r => r.RoomTypeId != null && roomTypeIds.Contains(r.RoomTypeId.Value))
            .Select(r => r.RoomId).ToListAsync(ct);
        if (await pt.AnyFutureSessionInRoomsAsync(roomIds, clock.UtcNow, ct))
        {
            throw new ConflictException("service_in_use_by_future_schedule",
                "Còn buổi PT tương lai trong phòng thuộc loại phòng này — hủy hoặc dời các buổi đó trước khi gỡ.");
        }
    }
}

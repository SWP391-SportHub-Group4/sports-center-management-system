using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.Scheduling.Rental.Application;

/// <summary>Phòng Gym = phòng đang hoạt động có loại phòng thuộc môn Gym (ánh xạ môn–loại phòng, <c>sport_room_types</c>).</summary>
internal static class GymRooms
{
    public static IQueryable<int> ActiveRoomIds(ISportHubDbContext db)
    {
        var gymRoomTypeIds = db.Set<SportRoomType>()
            .Join(db.Set<Sport>().Where(s => s.Code == SportCodes.Gym),
                link => link.SportId, sport => sport.SportId, (link, _) => link.RoomTypeId);
        return db.Set<Room>().AsNoTracking()
            .Where(r => r.IsActive && r.RoomTypeId != null && gymRoomTypeIds.Contains(r.RoomTypeId.Value))
            .Select(r => r.RoomId);
    }
}

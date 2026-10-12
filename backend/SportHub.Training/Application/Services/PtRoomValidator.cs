using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Training.Application.Services;

internal static class PtRoomValidator
{
    /// <summary>Coach đủ điều kiện PT, phòng active thuộc loại phòng PT (service_room_types) và đang mở cửa trong cả buổi.</summary>
    public static async Task RequireAsync(ISportCatalogReader catalog, ICoachSpecialtyReader specialties, int roomId, Guid coachId, DateTime startAtUtc, DateTime endAtUtc, CancellationToken ct)
    {
        var room = await catalog.GetRoomAsync(roomId, ct)
                   ?? throw new BadRequestException("room_not_found", "Room not found.");

        if (!room.IsActive)
        {
            throw new BadRequestException("room_inactive", "Room inactive.");
        }

        // Phòng Gym không tự thành phòng PT chỉ vì cùng môn: phải thuộc tập loại phòng của dịch vụ PT.
        var compatible = await specialties.IsPersonalTrainerAsync(coachId, ct)
                         && await catalog.IsRoomAllowedForServiceAsync(roomId, SportServiceType.PersonalTraining, ct);

        if (!compatible)
        {
            throw new BadRequestException("room_not_compatible", "Room not compatible.");
        }

        if (!await catalog.IsRoomOpenAsync(roomId, startAtUtc, endAtUtc, ct))
        {
            throw new BadRequestException("session_outside_opening_hours", "Session outside opening hours.");
        }
    }

}

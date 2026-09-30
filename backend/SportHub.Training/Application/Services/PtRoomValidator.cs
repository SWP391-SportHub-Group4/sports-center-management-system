using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Training.Application.Services;

internal static class PtRoomValidator
{
    /// <summary>Phòng phải active, chơi được ít nhất một môn 1-1 (OneOnOne) mà Coach dạy, và đang mở cửa trong cả buổi.</summary>
    public static async Task RequireAsync(ISportCatalogReader catalog, ICoachSpecialtyReader specialties, int roomId, Guid coachId, DateTime startAtUtc, DateTime endAtUtc, CancellationToken ct)
    {
        var room = await catalog.GetRoomAsync(roomId, ct)
                   ?? throw new BadRequestException("room_not_found", "Phòng không tồn tại.");

        if (!room.IsActive)
        {
            throw new BadRequestException("room_inactive", "Phòng đã ngừng hoạt động.");
        }

        var compatible = false;
        foreach (var sportId in await specialties.GetSportIdsAsync(coachId, ct))
        {
            var sport = await catalog.GetSportAsync(sportId, ct);

            if (sport is { IsActive: true, OperationType: "OneOnOne" } && await catalog.IsRoomCompatibleAsync(roomId, sportId, ct))
            {
                compatible = true;
                break;
            }
        }

        if (!compatible)
        {
            throw new BadRequestException("room_not_compatible", "Loại phòng không dùng được cho buổi PT 1-1 của Coach này (BR-108).");
        }

        if (!await catalog.IsRoomOpenAsync(roomId, startAtUtc, endAtUtc, ct))
        {
            throw new BadRequestException("session_outside_opening_hours", "Buổi PT nằm ngoài giờ mở cửa của phòng (BR-109).");
        }
    }

}

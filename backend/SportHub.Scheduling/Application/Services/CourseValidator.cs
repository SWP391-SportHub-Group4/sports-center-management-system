using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Kiểm tra dùng chung khi soạn/publish/dời lịch khóa học — luôn đọc qua port (catalog, chuyên môn, tài khoản), không đọc entity
/// module khác. Ném lỗi nghiệp vụ có mã ổn định.
/// </summary>
public sealed class CourseValidator(
    ISportCatalogReader catalog,
    ICoachSpecialtyReader coaches,
    IUserAccessReader users)
{
    /// <summary>Môn phải tồn tại, đang hoạt động và là dạng khóa nhóm (GroupCourse).</summary>
    public async Task<SportInfo> RequireGroupCourseSportAsync(int sportId, CancellationToken ct)
    {
        var sport = await catalog.GetSportAsync(sportId, ct)
                    ?? throw new BadRequestException("sport_not_found", "Sport not found.");

        if (!sport.IsActive)
        {
            throw new BadRequestException("sport_inactive", "Sport inactive.");
        }

        if (!sport.HasEnabledService(SportServiceType.GroupCourse))
        {
            throw new BadRequestException("sport_not_group_course", "Sport not group course.");
        }

        return sport;
    }

    /// <summary>Any active room can host a class, regardless of legacy sport metadata.</summary>
    public async Task<RoomInfo> RequireRoomForSportAsync(int roomId, int sportId, CancellationToken ct)
    {
        var room = await catalog.GetRoomAsync(roomId, ct)
                   ?? throw new BadRequestException("room_not_found", "Room not found.");

        if (!room.IsActive)
        {
            throw new BadRequestException("room_inactive", "Room inactive.");
        }

        if (!await catalog.IsRoomCompatibleAsync(roomId, sportId, ct))
        {
            throw new BadRequestException("room_not_compatible", "Room not compatible.");
        }

        return room;
    }

    /// <summary>Coach nội bộ đang hoạt động và có chuyên môn đúng môn.</summary>
    public async Task RequireCoachForSportAsync(Guid coachId, int sportId, CancellationToken ct)
    {
        if (!await coaches.IsActiveInternalCoachAsync(coachId, ct))
        {
            throw new BadRequestException("coach_not_found", "Coach not found.");
        }

        if (!await coaches.HasSportAsync(coachId, sportId, ct))
        {
            throw new BadRequestException("coach_specialty_mismatch", "Coach specialty mismatch.");
        }
    }

    public async Task<IReadOnlyDictionary<Guid, string>> CoachNamesAsync(IEnumerable<Guid?> ids, CancellationToken ct)
    {
        var map = new Dictionary<Guid, string>();

        foreach (var id in ids.Where(i => i.HasValue).Select(i => i!.Value).Distinct())
        {
            var info = await users.GetAsync(id, ct);
            map[id] = info?.FullName ?? string.Empty;
        }

        return map;
    }
}

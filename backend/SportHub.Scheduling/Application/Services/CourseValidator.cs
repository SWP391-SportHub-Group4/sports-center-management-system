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
                    ?? throw new BadRequestException("sport_not_found", "Môn không tồn tại.");

        if (!sport.IsActive)
        {
            throw new BadRequestException("sport_inactive", "Môn đã ngừng hoạt động.");
        }

        if (!sport.HasEnabledService(SportServiceType.GroupCourse))
        {
            throw new BadRequestException("sport_not_group_course", "Chỉ môn dạng khóa học nhóm mới mở được lớp.");
        }

        return sport;
    }

    /// <summary>Phòng phải tồn tại, đang hoạt động và có loại phòng chơi được môn này (BR-108).</summary>
    public async Task<RoomInfo> RequireRoomForSportAsync(int roomId, int sportId, CancellationToken ct)
    {
        var room = await catalog.GetRoomAsync(roomId, ct)
                   ?? throw new BadRequestException("room_not_found", "Phòng không tồn tại.");

        if (!room.IsActive)
        {
            throw new BadRequestException("room_inactive", "Phòng đã ngừng hoạt động.");
        }

        if (!await catalog.IsRoomCompatibleAsync(roomId, sportId, ct))
        {
            throw new BadRequestException("room_not_compatible", "Loại phòng không dùng được cho môn này (BR-108).");
        }

        return room;
    }

    /// <summary>Coach nội bộ đang hoạt động và có chuyên môn đúng môn.</summary>
    public async Task RequireCoachForSportAsync(Guid coachId, int sportId, CancellationToken ct)
    {
        if (!await coaches.IsActiveInternalCoachAsync(coachId, ct))
        {
            throw new BadRequestException("coach_not_found", "Tài khoản được gán không phải Coach đang hoạt động.");
        }

        if (!await coaches.HasSportAsync(coachId, sportId, ct))
        {
            throw new BadRequestException("coach_specialty_mismatch", "Coach không có chuyên môn của môn này.");
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

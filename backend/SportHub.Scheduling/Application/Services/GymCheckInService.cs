using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

public sealed class GymCheckInService(IGymCheckInRepository repository) : IGymCheckInService
{
    public const int DefaultPageSize = 20;

    public const int MaxPageSize = 100;

    public async Task<GymCheckInResponse> CreateAsync(
        Guid targetMemberId,
        Guid checkedInByUserId,
        CancellationToken cancellationToken = default)
    {
        var checkIn = new GymCheckIn
        {
            CheckInId = Guid.NewGuid(),
            MemberId = targetMemberId,
            CheckedInByUserId = checkedInByUserId,

            // Đồng hồ server, không phải giá trị client gửi lên (xem CreateGymCheckInRequest).
            CheckInTime = DateTime.UtcNow
        };

        // Toàn bộ kiểm tra BR-64 + insert nằm trong một transaction ở repository:
        // tách ra đây sẽ thành check-then-insert qua hai transaction và mở ra khe race.
        // KHÔNG tạo Enrollment/Attendance và KHÔNG trừ RemainingSessions — Gym khác lớp.
        await repository.CreateGuardedAsync(checkIn, cancellationToken);

        return ToDto(checkIn);
    }

    public async Task<PagedResult<GymCheckInResponse>> GetHistoryAsync(
        Guid memberId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize switch
        {
            < 1 => DefaultPageSize,
            > MaxPageSize => MaxPageSize,
            _ => pageSize
        };

        var (items, totalCount) = await repository.GetHistoryAsync(
            memberId,
            (page - 1) * pageSize,
            pageSize,
            cancellationToken);

        return new PagedResult<GymCheckInResponse>
        {
            Items = [.. items.Select(ToDto)],
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        };
    }

    private static GymCheckInResponse ToDto(GymCheckIn checkIn) => new()
    {
        CheckInId = checkIn.CheckInId,
        MemberId = checkIn.MemberId,
        CheckedInByUserId = checkIn.CheckedInByUserId,
        CheckInTime = checkIn.CheckInTime
    };
}

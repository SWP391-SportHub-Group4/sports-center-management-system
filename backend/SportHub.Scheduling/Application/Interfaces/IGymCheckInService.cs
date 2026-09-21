using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IGymCheckInService
{
    Task<GymCheckInDto> CreateAsync(
        Guid targetMemberId,
        Guid checkedInByUserId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GymCheckInDto>> GetHistoryAsync(
        Guid memberId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
}

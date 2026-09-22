using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IGymCheckInService
{
    Task<GymCheckInResponse> CreateAsync(
        Guid targetMemberId,
        Guid checkedInByUserId,
        CancellationToken cancellationToken = default);

    Task<PagedResult<GymCheckInResponse>> GetHistoryAsync(
        Guid memberId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
}

using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IPtEntitlementQueryService
{
    Task<IReadOnlyList<PtEntitlementResponse>> SearchAsync(
        Guid? memberId, Guid? coachId, string? status,
        int page, int pageSize, CancellationToken ct = default);
}

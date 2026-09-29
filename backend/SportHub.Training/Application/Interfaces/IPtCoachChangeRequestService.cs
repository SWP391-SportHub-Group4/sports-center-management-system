using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IPtCoachChangeRequestService
{
    Task<IReadOnlyList<PtCoachChangeRequestResponse>> SearchAsync(
        string? status,
        CancellationToken ct = default);

    Task<PtCoachChangeRequestResponse> RequestAsync(
        Guid entitlementId,
        RequestPtCoachChangeRequest request,
        Guid memberId,
        CancellationToken ct = default);

    Task<PtCoachChangeApprovalResponse> ApproveAsync(
        Guid requestId,
        ReviewPtCoachChangeRequest request,
        Guid managerId,
        CancellationToken ct = default);

    Task<PtCoachChangeRequestResponse> RejectAsync(
        Guid requestId,
        ReviewPtCoachChangeRequest request,
        Guid managerId,
        CancellationToken ct = default);
}

using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IPtSessionChangeRequestService
{
    Task<IReadOnlyList<PtSessionChangeRequestResponse>> SearchAsync(
        string? status, CancellationToken ct = default);

    Task<PtSessionChangeRequestResponse> RequestAsync(
        Guid sessionId, RequestPtSessionChangeRequest request, Guid memberId, CancellationToken ct = default);

    Task<PtSessionChangeRequestResponse> ApproveAsync(
        Guid requestId, ReviewPtSessionChangeRequest request, Guid managerId, CancellationToken ct = default);

    Task<PtSessionChangeRequestResponse> RejectAsync(
        Guid requestId, ReviewPtSessionChangeRequest request, Guid managerId, CancellationToken ct = default);
}

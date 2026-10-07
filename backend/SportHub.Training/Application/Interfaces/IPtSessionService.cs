using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IPtSessionService
{
    Task<IReadOnlyList<PtSessionResponse>> SearchAsync(
        Guid? memberId,
        Guid? coachId,
        string? status,
        DateTime? fromUtc,
        DateTime? toUtc,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<PtSessionResponse> GetAsync(Guid sessionId, CancellationToken ct = default);

    Task<PtSessionResponse> CreateAsync(
        CreatePtSessionRequest request, Guid managerId, CancellationToken ct = default);

    Task<PtAvailabilityResponse> GetSelfBookingAvailabilityAsync(
        Guid memberId, Guid entitlementId, DateOnly fromDate, DateOnly toDate, CancellationToken ct = default);

    Task<PtSessionResponse> SelfBookAsync(
        Guid memberId, SelfBookPtSessionRequest request, CancellationToken ct = default);

    Task<PtSessionResponse> ManagerCancelAsync(
        Guid sessionId, ManagerCancelPtSessionRequest request, Guid managerId, CancellationToken ct = default);

    Task<PtSessionResponse> ManagerRescheduleAsync(
        Guid sessionId, ManagerReschedulePtSessionRequest request, Guid managerId, CancellationToken ct = default);

    Task<PtSessionResponse> CompleteAsync(Guid sessionId, Guid coachId, CancellationToken ct = default);

    Task<PtSessionResponse> NoShowAsync(
        Guid sessionId, NoShowPtSessionRequest request, Guid coachId, CancellationToken ct = default);
}

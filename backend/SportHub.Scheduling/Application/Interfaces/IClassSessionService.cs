using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Rules;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassSessionService
{
    Task<IReadOnlyList<ClassSessionResponse>> SearchAsync(
        DateOnly fromDate, DateOnly toDate, int? classId, Guid? coachId, string? discipline,
        bool includeCancelled, CancellationToken ct = default);

    Task<ClassSessionResponse> GetAsync(Guid sessionId, CancellationToken ct = default);

    Task<IReadOnlyList<ClassSessionResponse>> GenerateAsync(
        int classId, GenerateSessionsRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassSessionResponse> CreateAdHocAsync(
        CreateAdHocSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassSessionResponse> UpdateAsync(
        Guid sessionId, UpdateSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassSessionResponse> CancelAsync(Guid sessionId, string reason, Guid actorUserId, CancellationToken ct = default);

    Task<ClassSessionResponse> RescheduleAsync(
        Guid sessionId, RescheduleSessionRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<SessionRosterResponse> GetRosterAsync(Guid sessionId, CancellationToken ct = default);
}

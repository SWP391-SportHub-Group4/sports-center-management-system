using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Training;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Membership.Domain.Enums;
using SportHub.Membership.Domain.Rules;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IEnrollmentService
{
    Task<EnrollmentResponse> CreateAsync(
        CreateEnrollmentRequest request, Guid memberId, Guid actorUserId, CancellationToken ct = default);

    Task<EnrollmentResponse> CancelAsync(Guid enrollmentId, Guid actorUserId, CancellationToken ct = default);

    Task<IReadOnlyList<EnrollmentResponse>> GetByMemberAsync(
        Guid memberId, bool upcomingOnly, CancellationToken ct = default);

    Task<EnrollmentResponse> GetAsync(Guid enrollmentId, CancellationToken ct = default);

    Task<IReadOnlyList<MemberSessionResponse>> GetMemberScheduleAsync(
        Guid memberId, DateOnly fromDate, DateOnly toDate, string? discipline, CancellationToken ct = default);
}

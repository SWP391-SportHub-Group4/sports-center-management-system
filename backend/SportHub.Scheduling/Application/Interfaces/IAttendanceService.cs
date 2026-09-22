using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IAttendanceService
{
    Task<AttendanceResponse> MarkAsync(
        Guid enrollmentId, MarkAttendanceRequest request, Guid actorUserId, bool actorIsReceptionist,
        CancellationToken ct = default);

    Task<IReadOnlyList<AttendanceResponse>> GetBySessionAsync(Guid sessionId, CancellationToken ct = default);
}

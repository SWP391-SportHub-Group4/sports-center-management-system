using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Application.Interfaces;

public interface IClassService
{
    Task<IReadOnlyList<ClassResponse>> GetAllAsync(string? discipline, bool includeArchived, CancellationToken ct = default);

    Task<ClassResponse> GetAsync(int classId, CancellationToken ct = default);

    Task<ClassResponse> CreateAsync(SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassResponse> UpdateAsync(int classId, SaveClassRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassResponse> SetStatusAsync(int classId, ClassStatus status, Guid actorUserId, CancellationToken ct = default);

    Task<ClassResponse> AddRecurrenceAsync(int classId, SaveRecurrenceRequest request, Guid actorUserId, CancellationToken ct = default);

    Task<ClassResponse> DeleteRecurrenceAsync(int classId, int recurrenceId, Guid actorUserId, CancellationToken ct = default);
}

using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IWorkoutService
{
    Task<IReadOnlyList<WorkoutPlanResponse>> GetPlansAsync(
        Guid? memberId, Guid? coachId, CancellationToken ct = default);

    Task<WorkoutPlanResponse> CreatePlanAsync(
        CreateWorkoutPlanRequest request, Guid coachId, CancellationToken ct = default);

    Task<IReadOnlyList<WorkoutResultResponse>> GetResultsAsync(
        Guid? memberId, Guid? coachId, DateTime? sinceUtc, CancellationToken ct = default);

    Task<WorkoutResultResponse> SaveResultAsync(
        SaveWorkoutResultRequest request, Guid coachId, CancellationToken ct = default);
}

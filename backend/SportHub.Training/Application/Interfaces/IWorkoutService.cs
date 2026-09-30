using SportHub.Training.Application.Commands;
using SportHub.Training.Application.DTOs;

namespace SportHub.Training.Application.Interfaces;

public interface IWorkoutService
{
    Task<IReadOnlyList<WorkoutPlanResponse>> GetPlansAsync(
        Guid? memberId, Guid? coachId, int page, int pageSize, CancellationToken ct = default);

    Task<WorkoutPlanResponse> CreatePlanAsync(
        CreateWorkoutPlanRequest request, Guid coachId, CancellationToken ct = default);

    Task<WorkoutPlanResponse> UpdatePlanAsync(
        Guid planId, UpdateWorkoutPlanRequest request, Guid coachId, CancellationToken ct = default);

    Task<WorkoutPlanResponse> ActivatePlanAsync(Guid planId, Guid coachId, CancellationToken ct = default);

    Task<WorkoutPlanResponse> ArchivePlanAsync(Guid planId, Guid coachId, CancellationToken ct = default);

    Task<IReadOnlyList<WorkoutResultResponse>> GetResultsAsync(
        Guid? memberId, Guid? coachId, DateTime? sinceUtc,
        int page, int pageSize, CancellationToken ct = default);

    Task<WorkoutResultResponse> SaveResultAsync(
        SaveWorkoutResultRequest request, Guid coachId, CancellationToken ct = default);

    Task<ProgressTimelineResponse> GetProgressAsync(
        Guid memberId, Guid? coachId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default);
}

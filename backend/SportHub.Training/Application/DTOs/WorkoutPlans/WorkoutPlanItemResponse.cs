namespace SportHub.Training.Application.DTOs;

public sealed record WorkoutPlanItemResponse(Guid ItemId, string Exercise, int Sets, int Reps, string? Notes);

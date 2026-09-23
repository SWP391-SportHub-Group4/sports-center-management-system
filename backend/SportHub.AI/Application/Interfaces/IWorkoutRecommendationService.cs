using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Membership.Domain.Entities;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Training.Domain.Entities;
using System.Diagnostics;
using System.Text.Json;

namespace SportHub.AI.Application.Interfaces;

public interface IWorkoutRecommendationService
{
    Task<WorkoutSuggestionResponse> SuggestAsync(Guid memberId, Guid coachId, CancellationToken ct = default);
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Application.Services;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;
using SportHub.AI.Application.DTOs.Manager;
using SportHub.AI.Domain.Constants;
using SportHub.AI.Domain.Entities;

namespace SportHub.AI.Api;

public sealed record AiLogResponse(
    Guid LogId,
    Guid UserId,
    string QueryType,
    string InputPayload,
    string ResponsePayload,
    int ResponseTimeMs,
    DateTime CreatedAt);

public sealed record MemberWorkoutSuggestionHistoryItem(
    Guid Id,
    DateTime GeneratedAt,
    string Sport,
    string Goal,
    string Level,
    IReadOnlyList<WorkoutSuggestedExercise> Items,
    string Rationale);

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController(
    IWorkoutRecommendationService recommendations,
    IAiChatService chatService,
    IManagerScheduleSuggestionService managerSchedules,
    ISportHubDbContext db) : ControllerBase
{
    [Authorize(
        Policy = SportHubPolicies.CenterManager)]
    [HttpPost(
        "manager/schedule-suggestions")]
    public async Task<
        ActionResult<
            ManagerScheduleSuggestionResponse>>
        SuggestManagerSchedule(
            [FromBody]
            ManagerScheduleSuggestionRequest request,
            CancellationToken ct)
    {
        var managerId =
            User.RequireUserId();

        var result =
            await managerSchedules
                .SuggestAsync(
                    managerId,
                    request,
                    ct);

        return Ok(result);
    }
    //-----
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-suggestions/{memberId:guid}")]
    public async Task<IActionResult> Suggest(
        Guid memberId,
        CancellationToken ct,
        [FromQuery] string sport = "Gym")
    {
        var coachId = User.RequireUserId();

        var hasRelationship = await SportHub.Scheduling.Application.Services.CoachDataScope.CanReadMemberAsync(db, coachId, memberId, ct);

        if (!hasRelationship)
        {
            throw new ForbiddenException(
                "no_active_relationship",
                "No active relationship.");
        }

        return Ok(
            await recommendations.SuggestAsync(
                memberId,
                coachId,
                ct, sport));
    }

    // Member self-service: advisory preview only, never creates an official Coach plan.
    // Member identity always comes from the authenticated JWT, never from a request parameter.
    [Authorize(Roles = "Member")]
    [HttpPost("workout-suggestions/me")]
    public async Task<IActionResult> SuggestForSelf(CancellationToken ct, [FromQuery] string sport = "Gym")
    {
        var memberId = User.RequireUserId();
        return Ok(await recommendations.SuggestAsync(memberId, memberId, ct, sport));
    }

    [Authorize(Roles = "Member")]
    [HttpGet("workout-suggestions/me")]
    public async Task<ActionResult<IReadOnlyList<MemberWorkoutSuggestionHistoryItem>>> MyWorkoutSuggestions(CancellationToken ct)
    {
        var memberId = User.RequireUserId();
        var logs = await db.Set<AiLog>().AsNoTracking()
            .Where(log => log.UserId == memberId && log.QueryType == AiQueryTypes.WorkoutSuggestion)
            .OrderByDescending(log => log.CreatedAt)
            .Take(50)
            .ToListAsync(ct);
        var history = new List<MemberWorkoutSuggestionHistoryItem>();
        foreach (var log in logs)
        {
            try
            {
                using var input = JsonDocument.Parse(log.InputPayload);
                using var output = JsonDocument.Parse(log.ResponsePayload);
                var source = input.RootElement;
                var response = output.RootElement;
                if (!source.TryGetProperty("MemberId", out var owner) ||
                    !owner.TryGetGuid(out var ownerId) || ownerId != memberId ||
                    !response.TryGetProperty("items", out var itemsJson) ||
                    itemsJson.ValueKind != JsonValueKind.Array ||
                    itemsJson.GetArrayLength() == 0 ||
                    response.TryGetProperty("error", out var error) && error.ValueKind != JsonValueKind.Null)
                    continue;
                var items = itemsJson.Deserialize<List<WorkoutSuggestedExercise>>(new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                if (items is null) continue;
                history.Add(new MemberWorkoutSuggestionHistoryItem(
                    log.LogId, log.CreatedAt,
                    source.TryGetProperty("Sport", out var sportValue) ? sportValue.GetString() ?? "Gym" : "Gym",
                    source.TryGetProperty("Goal", out var goal) ? goal.GetString() ?? "" : "",
                    source.TryGetProperty("Level", out var level) ? level.GetString() ?? "" : "",
                    items,
                    response.TryGetProperty("rationale", out var rationale) ? rationale.GetString() ?? "" : ""));
            }
            catch (JsonException) { /* Ignore malformed legacy log entries. */ }
        }
        return Ok(history);
    }

    [Authorize(Roles = "Member,Coach")]
    [HttpPost("chat")]
    public async Task<ActionResult<AiChatResponse>> Chat(
        [FromBody] AiChatRequest request,
        CancellationToken ct)
    {
        var memberId =
            User.RequireUserId();

        var response =
            await chatService.AskAsync(
                memberId,
                request.Question,
                request.PreviousInteractionId,
                ct);

        return Ok(response);
    }

    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var query = db.Set<AiLog>().AsNoTracking();

        if (!User.IsInRole(SportHubRoleNames.CenterManager))
        {
            if (!User.IsInRole(SportHubRoleNames.Coach))
            {
                throw new ForbiddenException(
                    "ai_logs_forbidden",
                    "Ai logs forbidden.");
            }

            var coachId = User.RequireUserId();

            query = query.Where(log => log.UserId == coachId);
        }

        var logs = await query
            .OrderByDescending(log => log.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(log => new AiLogResponse(
                log.LogId,
                log.UserId,
                log.QueryType,
                log.InputPayload,
                log.ResponsePayload,
                log.ResponseTimeMs,
                log.CreatedAt))
            .ToListAsync(ct);

        if (User.IsInRole(SportHubRoleNames.Coach)) {
            var allowed = (await SportHub.Scheduling.Application.Services.CoachDataScope.Enrollments(db, User.RequireUserId())
                .Select(e => e.MemberId).Distinct().ToListAsync(ct)).ToHashSet();
            logs = logs.Where(log => {
                try {
                    using var input = JsonDocument.Parse(log.InputPayload);
                    return input.RootElement.ValueKind == JsonValueKind.Object
                        && (input.RootElement.TryGetProperty("MemberId", out var id) || input.RootElement.TryGetProperty("memberId", out id))
                        && id.ValueKind == JsonValueKind.String && id.TryGetGuid(out var memberId) && allowed.Contains(memberId);
                } catch (JsonException) { return false; }
            }).ToList();
        }
        return Ok(logs);
    }
}

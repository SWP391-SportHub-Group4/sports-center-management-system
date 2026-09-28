using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Application.Interfaces;
using SportHub.Identity.Domain.Enums;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.AI.Api;

public sealed record AiLogResponse(
    Guid LogId,
    Guid UserId,
    string QueryType,
    string InputPayload,
    string ResponsePayload,
    int ResponseTimeMs,
    DateTime CreatedAt);

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController(
    IWorkoutRecommendationService recommendations,
    IAiChatService chatService,
    ISportHubDbContext db,
    ICoachProfileReader coachProfiles) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-suggestions/{memberId:guid}")]
    public async Task<IActionResult> Suggest(
        Guid memberId,
        CancellationToken ct)
    {
        var coachId = User.RequireUserId();

        // ClassInstructor phải bị chặn trước khi hệ thống kiểm tra
        // quan hệ hoặc đọc dữ liệu của Member.
        await coachProfiles.RequireCategoryAsync(
            coachId,
            CoachCategory.PersonalTrainer,
            ct);

        var hasRelationship =
            await db.Set<CoachMemberRelationship>()
                .AnyAsync(
                    r =>
                        r.CoachId == coachId &&
                        r.MemberId == memberId &&
                        r.Status == RelationshipStatus.Active,
                    ct);

        if (!hasRelationship)
        {
            throw new ForbiddenException(
                "no_active_relationship",
                "Bạn chưa có quan hệ huấn luyện đang hoạt động với hội viên này (BR-23).");
        }

        return Ok(
            await recommendations.SuggestAsync(
                memberId,
                coachId,
                ct));
    }

    [Authorize(Policy = SportHubPolicies.Member)]
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
                    "Bạn không có quyền xem nhật ký AI.");
            }

            var coachId = User.RequireUserId();

            await coachProfiles.RequireCategoryAsync(
                coachId,
                CoachCategory.PersonalTrainer,
                ct);

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

        return Ok(logs);
    }
}

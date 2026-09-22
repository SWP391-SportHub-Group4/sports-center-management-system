using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Training.Domain.Entities;
using SportHub.Training.Domain.Enums;

namespace SportHub.AI.Api;

public sealed record AiLogResponse(
    Guid LogId, Guid UserId, string QueryType, string InputPayload, string ResponsePayload,
    int ResponseTimeMs, DateTime CreatedAt);

/// <summary>
/// Gợi ý tập luyện từ AI — BR-26 (dành cho HLV, cần đủ 3 đầu vào), BR-27 (mọi lượt gọi đều
/// vào AI_Logs).
///
/// Flow 6 (chatbot, BR-28/BR-29) là stretch ngoài scope cam kết (SSOT §1.4) và KHÔNG có
/// endpoint nào ở đây.
/// </summary>
[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController(IWorkoutRecommendationService recommendations, ISportHubDbContext db) : ControllerBase
{
    /// <summary>
    /// BR-26 — HLV xin gợi ý cho một hội viên. Chỉ hội viên mình ĐANG phụ trách: gợi ý đọc
    /// mục tiêu, trình độ và lịch sử tập của họ, tức là dữ liệu cá nhân.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpPost("workout-suggestions/{memberId:guid}")]
    public async Task<IActionResult> Suggest(Guid memberId, CancellationToken ct)
    {
        var coachId = User.RequireUserId();

        var hasRelationship = await db.Set<CoachMemberRelationship>().AnyAsync(
            r => r.CoachId == coachId && r.MemberId == memberId && r.Status == RelationshipStatus.Active, ct);

        if (!hasRelationship)
        {
            throw new ForbiddenException(
                "no_active_relationship",
                "Bạn chưa có quan hệ huấn luyện đang hoạt động với hội viên này (BR-23).");
        }

        return Ok(await recommendations.SuggestAsync(memberId, coachId, ct));
    }

    /// <summary>
    /// BR-27 — nhật ký AI phục vụ kiểm toán và đánh giá chất lượng. Đọc bởi Center Manager;
    /// HLV chỉ thấy các lượt gọi của chính mình.
    /// </summary>
    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs([FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var query = db.Set<AiLog>().AsNoTracking();

        if (!User.IsInRole(SportHubRoleNames.CenterManager))
        {
            if (!User.IsInRole(SportHubRoleNames.Coach))
            {
                throw new ForbiddenException("ai_logs_forbidden", "Bạn không có quyền xem nhật ký AI.");
            }

            query = query.Where(l => l.UserId == User.RequireUserId());
        }

        var logs = await query
            .OrderByDescending(l => l.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(l => new AiLogResponse(
                l.LogId, l.UserId, l.QueryType, l.InputPayload, l.ResponsePayload, l.ResponseTimeMs, l.CreatedAt))
            .ToListAsync(ct);

        return Ok(logs);
    }
}

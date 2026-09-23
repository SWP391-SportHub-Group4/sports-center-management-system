using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

/// <summary>Buổi học — BR-51 (sức chứa), BR-54 (hủy/dời).</summary>
[ApiController]
[Authorize]
[Route("api/class-sessions")]
public class ClassSessionsController(IClassSessionService sessions) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] DateOnly fromDate,
        [FromQuery] DateOnly toDate,
        [FromQuery] int? classId,
        [FromQuery] Guid? coachId,
        [FromQuery] string? discipline,
        [FromQuery] bool includeCancelled = false,
        CancellationToken ct = default)
        => Ok(await sessions.SearchAsync(fromDate, toDate, classId, coachId, discipline, includeCancelled, ct));

    /// <summary>Lịch dạy của chính HLV đang đăng nhập — coachId lấy từ JWT.</summary>
    [Authorize(Policy = SportHubPolicies.Coach)]
    [HttpGet("mine")]
    public async Task<IActionResult> GetMine(
        [FromQuery] DateOnly fromDate,
        [FromQuery] DateOnly toDate,
        CancellationToken ct = default)
        => Ok(await sessions.SearchAsync(fromDate, toDate, null, User.RequireUserId(), null, false, ct));

    [HttpGet("{sessionId:guid}")]
    public async Task<IActionResult> Get(Guid sessionId, CancellationToken ct)
        => Ok(await sessions.GetAsync(sessionId, ct));

    /// <summary>
    /// Danh sách điểm danh của buổi. HLV chỉ xem được buổi MÌNH dạy — xem lớp người khác là
    /// đọc dữ liệu hội viên ngoài phạm vi phụ trách.
    /// </summary>
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("{sessionId:guid}/roster")]
    public async Task<IActionResult> GetRoster(Guid sessionId, CancellationToken ct)
    {
        var roster = await sessions.GetRosterAsync(sessionId, ct);

        if (User.IsInRole(SportHubRoleNames.Coach) && roster.Session.CoachId != User.RequireUserId())
        {
            throw new ForbiddenException("not_session_coach", "Bạn không phụ trách buổi học này.");
        }

        return Ok(roster);
    }

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> CreateAdHoc([FromBody] CreateAdHocSessionRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await sessions.CreateAdHocAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{sessionId:guid}")]
    public async Task<IActionResult> Update(
        Guid sessionId, [FromBody] UpdateSessionRequest request, CancellationToken ct)
        => Ok(await sessions.UpdateAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid sessionId, [FromBody] CancelSessionRequest request, CancellationToken ct)
        => Ok(await sessions.CancelAsync(sessionId, request.Reason, User.RequireUserId(), ct));

    /// <summary>BR-54 — trả về BUỔI THAY THẾ vừa tạo, đã có liên kết về buổi cũ.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(
        Guid sessionId, [FromBody] RescheduleSessionRequest request, CancellationToken ct)
        => Ok(await sessions.RescheduleAsync(sessionId, request, User.RequireUserId(), ct));
}

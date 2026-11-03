using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

/// <summary>Buổi học của khóa: xem, roster, điểm danh (Coach phụ trách; Lễ tân chỉ chỉnh khi Member kiến nghị), dời và hủy kèm buổi bù (chỉ Manager).</summary>
[ApiController]
[Authorize]
[Route("api/class-sessions")]
public class ClassSessionsController(
    IClassSessionService sessions,
    IAttendanceService attendance) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("{sessionId:guid}")]
    public async Task<IActionResult> Get(Guid sessionId, CancellationToken ct)
        => Ok(await sessions.GetAsync(sessionId, CoachScope(), ct));

    /// <summary>Danh sách học viên của buổi; Coach chỉ xem buổi của khóa mình phụ trách (chỉ đọc).</summary>
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("{sessionId:guid}/roster")]
    public async Task<IActionResult> Roster(Guid sessionId, CancellationToken ct)
        => Ok(await sessions.GetRosterAsync(sessionId, CoachScope(), ct));

    /// <summary>BR-98: Coach phụ trách điểm danh (Present/Absent). Lễ tân chỉ chỉnh bản ghi đã có khi Member kiến nghị (bắt buộc Reason). Manager chỉ đọc qua roster.</summary>
    [Authorize(Roles = SportHubRoleNames.Coach + "," + SportHubRoleNames.Receptionist)]
    [HttpPut("{sessionId:guid}/attendance/{enrollmentId:guid}")]
    public async Task<IActionResult> MarkAttendance(
        Guid sessionId, Guid enrollmentId, [FromBody] MarkAttendanceRequest request, CancellationToken ct)
        => Ok(await attendance.MarkAsync(sessionId, enrollmentId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/incident")]
    public async Task<IActionResult> ReportIncident(Guid sessionId, [FromBody] ReportSessionIncidentRequest request, CancellationToken ct)
        => Ok(await sessions.ReportIncidentAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(Guid sessionId, [FromBody] RescheduleSessionRequest request, CancellationToken ct)
        => Ok(await sessions.RescheduleAsync(sessionId, request, User.RequireUserId(), ct));

    /// <summary>Hủy buổi và tạo buổi bù ở cuối lịch trong một transaction. Trả buổi bù.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid sessionId, [FromBody] CancelSessionRequest request, CancellationToken ct)
        => Ok(await sessions.CancelWithMakeupAsync(sessionId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/incident-makeup")]
    public async Task<IActionResult> IncidentMakeup(Guid sessionId, [FromBody] IncidentMakeupRequest request, CancellationToken ct)
        => Ok(await sessions.CreateIncidentMakeupAsync(sessionId, request, User.RequireUserId(), ct));

    private Guid? CoachScope()
        => User.IsInRole(SportHubRoleNames.Coach) ? User.RequireUserId() : null;
}

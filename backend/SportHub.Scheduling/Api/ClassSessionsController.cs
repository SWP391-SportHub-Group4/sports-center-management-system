using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Api;

/// <summary>Buổi học của khóa: xem, roster, điểm danh (chỉ Lễ tân), dời và hủy kèm buổi bù (chỉ Manager).</summary>
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

    /// <summary>BR-98: chỉ Lễ tân điểm danh (Present/Absent). Manager và Coach chỉ đọc qua roster.</summary>
    [Authorize(Policy = SportHubPolicies.AttendanceCheckIn)]
    [HttpPut("{sessionId:guid}/attendance/{enrollmentId:guid}")]
    public async Task<IActionResult> MarkAttendance(
        Guid sessionId, Guid enrollmentId, [FromBody] MarkAttendanceRequest request, CancellationToken ct)
        => Ok(await attendance.MarkAsync(sessionId, enrollmentId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(Guid sessionId, [FromBody] RescheduleSessionRequest request, CancellationToken ct)
        => Ok(await sessions.RescheduleAsync(sessionId, request, User.RequireUserId(), ct));

    /// <summary>Hủy buổi và tạo buổi bù ở cuối lịch trong một transaction. Trả buổi bù.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{sessionId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid sessionId, [FromBody] CancelSessionRequest request, CancellationToken ct)
        => Ok(await sessions.CancelWithMakeupAsync(sessionId, request, User.RequireUserId(), ct));

    private Guid? CoachScope()
        => User.IsInRole(SportHubRoleNames.Coach) ? User.RequireUserId() : null;
}

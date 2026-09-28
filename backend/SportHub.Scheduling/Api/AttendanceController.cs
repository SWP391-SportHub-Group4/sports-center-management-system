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

/// <summary>Điểm danh lớp Yoga/Group X — BR-21, BR-53, BR-98 (mới 28/09/2026: chỉ Receptionist).</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.AttendanceCheckIn)]
[Route("api/attendance")]
public class AttendanceController(IAttendanceService attendance) : ControllerBase
{
    [HttpPost("{enrollmentId:guid}")]
    public async Task<IActionResult> Mark(
        Guid enrollmentId, [FromBody] MarkAttendanceRequest request, CancellationToken ct)
        => Ok(await attendance.MarkAsync(enrollmentId, request, User.RequireUserId(), ct));

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GetBySession(Guid sessionId, CancellationToken ct)
        => Ok(await attendance.GetBySessionAsync(sessionId, ct));
}

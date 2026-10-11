using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Application.Interfaces;
using SportHub.Scheduling.Application.Commands;

namespace SportHub.Scheduling.Api;

[ApiController]
[Authorize(Policy = SportHubPolicies.Coach)]
[Route("api/coaches/me/teaching")]
public sealed class ClassTeachingController(ClassTeachingService teaching, IAttendanceService attendance) : ControllerBase
{
    [HttpGet("classes/{classId:int}/members")]
    public async Task<IActionResult> Members(int classId, CancellationToken ct) => Ok(await teaching.MembersAsync(classId, User.RequireUserId(), ct));
    [HttpGet("classes/{classId:int}/records")]
    public async Task<IActionResult> Records(int classId, [FromQuery] int page = 1, CancellationToken ct = default) => Ok(await teaching.RecordsAsync(classId, User.RequireUserId(), false, page, ct));
    [HttpPost("classes/{classId:int}/records")]
    public async Task<IActionResult> Create(int classId, TeachingWriteRequest request, CancellationToken ct) => Ok(await teaching.SaveAsync(classId, User.RequireUserId(), request, false, ct));
    [HttpPut("classes/{classId:int}/records/{recordId:guid}")]
    public async Task<IActionResult> Update(int classId, Guid recordId, TeachingWriteRequest request, CancellationToken ct) => Ok(await teaching.SaveAsync(classId, User.RequireUserId(), request with { RecordId = recordId }, true, ct));
    [HttpPut("sessions/{sessionId:guid}/attendance/{enrollmentId:guid}")]
    public async Task<IActionResult> Attendance(Guid sessionId, Guid enrollmentId, MarkAttendanceRequest request, CancellationToken ct)
        => Ok(await attendance.MarkAsync(sessionId, enrollmentId, request, User.RequireUserId(), ct));
}

[ApiController]
[Authorize(Policy = SportHubPolicies.Member)]
[Route("api/members/me/classes/{classId:int}/teaching-records")]
public sealed class MemberClassTeachingController(ClassTeachingService teaching) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Records(int classId, [FromQuery] int page = 1, CancellationToken ct = default)
        => Ok(await teaching.RecordsAsync(classId, User.RequireUserId(), true, page, ct));
}

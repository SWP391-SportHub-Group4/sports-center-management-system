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
public sealed class ClassTeachingController(ClassTeachingService teaching, IAttendanceService attendance,
    SportHub.Membership.Application.Interfaces.IMemberTrainingProfileService profiles) : ControllerBase
{
    [HttpGet("students/{memberId:guid}/health-profile")]
    public async Task<IActionResult> StudentHealthProfile(Guid memberId, CancellationToken ct)
    {
        // Reuse the student directory's assignment checks before exposing physical information.
        await teaching.StudentContextAsync(User.RequireUserId(), memberId, ct);
        return Ok(new { Profile = await profiles.GetAsync(memberId, ct) });
    }
    [HttpGet("students")]
    public async Task<IActionResult> Students([FromQuery] int page = 1, [FromQuery] string? search = null,
        [FromQuery] int? sportId = null, CancellationToken ct = default)
        => Ok(await teaching.StudentsAsync(User.RequireUserId(), page, search, sportId, ct));
    [HttpGet("students/{memberId:guid}")]
    public async Task<IActionResult> Student(Guid memberId, CancellationToken ct)
        => Ok(await teaching.StudentContextAsync(User.RequireUserId(), memberId, ct));
    [HttpGet("students/{memberId:guid}/history")]
    public async Task<IActionResult> StudentHistory(Guid memberId, [FromQuery] int classId, [FromQuery] int page = 1, CancellationToken ct = default, [FromQuery] int? sourceClassId = null)
        => Ok(await teaching.StudentHistoryAsync(User.RequireUserId(), memberId, classId, page, ct, sourceClassId));
    [HttpGet("students/{memberId:guid}/history/classes")]
    public async Task<IActionResult> StudentHistoryClasses(Guid memberId, [FromQuery] int classId, [FromQuery] int page = 1,
        [FromQuery] string? search = null, CancellationToken ct = default)
        => Ok(await teaching.StudentHistoryClassesAsync(User.RequireUserId(), memberId, classId, page, search, ct));
    [HttpGet("classes/{classId:int}/members")]
    public async Task<IActionResult> Members(int classId, CancellationToken ct, [FromQuery] Guid? memberId = null) => Ok(await teaching.MembersAsync(classId, User.RequireUserId(), ct, memberId));
    [HttpGet("classes/{classId:int}/records")]
    public async Task<IActionResult> Records(int classId, [FromQuery] int page = 1, CancellationToken ct = default, [FromQuery] Guid? memberId = null) => Ok(await teaching.RecordsAsync(classId, User.RequireUserId(), false, page, ct, memberId));
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

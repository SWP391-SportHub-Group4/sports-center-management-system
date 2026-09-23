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

/// <summary>Đăng ký lớp — BR-16..BR-19, BR-50.</summary>
[ApiController]
[Authorize]
[Route("api")]
public class EnrollmentsController(IEnrollmentService enrollments) : ControllerBase
{
    /// <summary>
    /// Hội viên tự đăng ký (memberId từ JWT) hoặc Lễ tân đăng ký hộ (memberId trong body).
    /// Hội viên gửi kèm memberId của người khác sẽ bị từ chối — không có đường nào đăng ký hộ
    /// mà không phải Lễ tân.
    /// </summary>
    [HttpPost("enrollments")]
    public async Task<IActionResult> Create([FromBody] CreateEnrollmentRequest request, CancellationToken ct)
    {
        var actorId = User.RequireUserId();
        var isFrontDesk = User.IsInRole(SportHubRoleNames.Receptionist)
                          || User.IsInRole(SportHubRoleNames.CenterManager);

        Guid memberId;

        if (request.MemberId is null || request.MemberId == actorId)
        {
            if (!User.IsInRole(SportHubRoleNames.Member))
            {
                throw new ForbiddenException(
                    "member_id_required", "Nhân viên phải chỉ định memberId của hội viên cần đăng ký.");
            }

            memberId = actorId;
        }
        else
        {
            if (!isFrontDesk)
            {
                throw new ForbiddenException(
                    "cannot_enroll_others", "Chỉ Lễ tân hoặc Quản lý mới đăng ký hộ hội viên khác.");
            }

            memberId = request.MemberId.Value;
        }

        return StatusCode(
            StatusCodes.Status201Created, await enrollments.CreateAsync(request, memberId, actorId, ct));
    }

    /// <summary>BR-17 — hội viên tự hủy đăng ký của mình, hoặc Lễ tân/Quản lý hủy hộ.</summary>
    [HttpPost("enrollments/{enrollmentId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid enrollmentId, CancellationToken ct)
    {
        var actorId = User.RequireUserId();

        if (User.IsInRole(SportHubRoleNames.Member))
        {
            var enrollment = await enrollments.GetAsync(enrollmentId, ct);

            if (enrollment.MemberId != actorId)
            {
                throw new ForbiddenException("enrollment_not_owned", "Đăng ký này không thuộc về bạn.");
            }
        }
        else if (!User.IsInRole(SportHubRoleNames.Receptionist) && !User.IsInRole(SportHubRoleNames.CenterManager))
        {
            throw new ForbiddenException("cannot_cancel_enrollment", "Bạn không có quyền hủy đăng ký (BR-17).");
        }

        return Ok(await enrollments.CancelAsync(enrollmentId, actorId, ct));
    }

    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/enrollments")]
    public async Task<IActionResult> GetMine([FromQuery] bool upcomingOnly = false, CancellationToken ct = default)
        => Ok(await enrollments.GetByMemberAsync(User.RequireUserId(), upcomingOnly, ct));

    /// <summary>Lịch lớp kèm tình trạng đăng ký của chính hội viên — màn hình đặt lịch.</summary>
    [Authorize(Policy = SportHubPolicies.Member)]
    [HttpGet("members/me/schedule")]
    public async Task<IActionResult> GetMySchedule(
        [FromQuery] DateOnly fromDate,
        [FromQuery] DateOnly toDate,
        [FromQuery] string? discipline,
        CancellationToken ct = default)
        => Ok(await enrollments.GetMemberScheduleAsync(User.RequireUserId(), fromDate, toDate, discipline, ct));

    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet("members/{memberId:guid}/enrollments")]
    public async Task<IActionResult> GetByMember(
        Guid memberId, [FromQuery] bool upcomingOnly = false, CancellationToken ct = default)
        => Ok(await enrollments.GetByMemberAsync(memberId, upcomingOnly, ct));
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SportHub.BuildingBlocks.Api;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Services;

namespace SportHub.Scheduling.Api;

/// <summary>Phòng tập — BR-39 (chỉ Center Manager cấu hình), BR-57 (tên duy nhất).</summary>
[ApiController]
[Authorize]
[Route("api/rooms")]
public class RoomsController(IRoomService rooms) : ControllerBase
{
    [Authorize(Policy = SportHubPolicies.StaffRead)]
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await rooms.GetAllAsync(ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveRoomRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await rooms.CreateAsync(request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{roomId:int}")]
    public async Task<IActionResult> Update(int roomId, [FromBody] SaveRoomRequest request, CancellationToken ct)
        => Ok(await rooms.UpdateAsync(roomId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpDelete("{roomId:int}")]
    public async Task<IActionResult> Delete(int roomId, CancellationToken ct)
    {
        await rooms.DeleteAsync(roomId, User.RequireUserId(), ct);

        return NoContent();
    }
}

/// <summary>Lớp học và mẫu lịch lặp — BR-12, BR-14, BR-15.</summary>
[ApiController]
[Authorize]
[Route("api/classes")]
public class ClassesController(IClassService classes, IClassSessionService sessions) : ControllerBase
{
    /// <summary>Hội viên cũng đọc được để chọn lớp; bộ lọc includeArchived chỉ dành cho Manager.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? discipline,
        [FromQuery] bool includeArchived = false,
        CancellationToken ct = default)
    {
        var allowArchived = includeArchived && User.IsInRole(SportHubRoleNames.CenterManager);

        return Ok(await classes.GetAllAsync(discipline, allowArchived, ct));
    }

    [HttpGet("{classId:int}")]
    public async Task<IActionResult> Get(int classId, CancellationToken ct) => Ok(await classes.GetAsync(classId, ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveClassRequest request, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await classes.CreateAsync(request, User.RequireUserId(), ct));

    /// <summary>BR-14 — phân công/phân công lại HLV nằm trong đường này, chỉ Center Manager.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPut("{classId:int}")]
    public async Task<IActionResult> Update(int classId, [FromBody] SaveClassRequest request, CancellationToken ct)
        => Ok(await classes.UpdateAsync(classId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/archive")]
    public async Task<IActionResult> Archive(int classId, CancellationToken ct)
        => Ok(await classes.SetStatusAsync(classId, ClassStatus.Archived, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/reactivate")]
    public async Task<IActionResult> Reactivate(int classId, CancellationToken ct)
        => Ok(await classes.SetStatusAsync(classId, ClassStatus.Active, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/recurrences")]
    public async Task<IActionResult> AddRecurrence(
        int classId, [FromBody] SaveRecurrenceRequest request, CancellationToken ct)
        => Ok(await classes.AddRecurrenceAsync(classId, request, User.RequireUserId(), ct));

    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpDelete("{classId:int}/recurrences/{recurrenceId:int}")]
    public async Task<IActionResult> DeleteRecurrence(int classId, int recurrenceId, CancellationToken ct)
        => Ok(await classes.DeleteRecurrenceAsync(classId, recurrenceId, User.RequireUserId(), ct));

    /// <summary>BR-15 — sinh buổi học từ mẫu lặp. Chạy lại cùng khoảng ngày không nhân đôi lịch.</summary>
    [Authorize(Policy = SportHubPolicies.CenterManager)]
    [HttpPost("{classId:int}/generate-sessions")]
    public async Task<IActionResult> GenerateSessions(
        int classId, [FromBody] GenerateSessionsRequest request, CancellationToken ct)
        => Ok(await sessions.GenerateAsync(classId, request, User.RequireUserId(), ct));
}

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

/// <summary>Điểm danh lớp — BR-21, BR-22, BR-53.</summary>
[ApiController]
[Authorize(Policy = SportHubPolicies.AttendanceCheckIn)]
[Route("api/attendance")]
public class AttendanceController(IAttendanceService attendance) : ControllerBase
{
    [HttpPost("{enrollmentId:guid}")]
    public async Task<IActionResult> Mark(
        Guid enrollmentId, [FromBody] MarkAttendanceRequest request, CancellationToken ct)
        => Ok(await attendance.MarkAsync(
            enrollmentId,
            request,
            User.RequireUserId(),
            User.IsInRole(SportHubRoleNames.Receptionist),
            ct));

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<IActionResult> GetBySession(Guid sessionId, CancellationToken ct)
        => Ok(await attendance.GetBySessionAsync(sessionId, ct));
}

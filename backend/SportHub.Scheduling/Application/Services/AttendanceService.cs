using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Điểm danh lớp — BR-21 (tối đa một bản ghi cho mỗi đăng ký), BR-22 (chỉ Coach dạy buổi đó
/// hoặc Lễ tân), BR-53 (chỉ ghi tay Present/Absent; No-show là việc của job).
/// </summary>
public sealed class AttendanceService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : IAttendanceService
{
    public async Task<AttendanceResponse> MarkAsync(
        Guid enrollmentId,
        MarkAttendanceRequest request,
        Guid actorUserId,
        bool actorIsReceptionist,
        CancellationToken ct = default)
    {
        // BR-53 — NoShow không bao giờ nhận từ client; chỉ AttendanceFinalizerJob sinh ra nó.
        if (!Enum.TryParse<AttendanceStatus>(request.Status, ignoreCase: true, out var status)
            || status == AttendanceStatus.NoShow)
        {
            throw new BadRequestException(
                "invalid_attendance_status",
                "Chỉ ghi nhận Present hoặc Absent. No-show do hệ thống tự ghi sau khi buổi học kết thúc (BR-53).");
        }

        var enrollment = await db.Set<Enrollment>()
            .Include(e => e.Session)
            .Include(e => e.Attendance)
            .SingleOrDefaultAsync(e => e.EnrollmentId == enrollmentId, ct)
            ?? throw new NotFoundException("enrollment_not_found", "Không tìm thấy đăng ký.");

        // BR-20 — đăng ký đã hủy không bị ghi No-show, và cũng không có lý do gì để điểm danh:
        // hội viên đã rút khỏi buổi học đó.
        if (enrollment.Status != EnrollmentStatus.Confirmed)
        {
            throw new ConflictException(
                "enrollment_not_confirmed",
                $"Đăng ký đang ở trạng thái {enrollment.Status} — không điểm danh được.");
        }

        // BR-22 — chỉ Coach ĐƯỢC GÁN cho buổi đó, hoặc Lễ tân tại quầy.
        // Coach khác không điểm danh hộ được, kể cả khi cũng có vai trò Coach.
        if (!actorIsReceptionist && enrollment.Session!.CoachId != actorUserId)
        {
            throw new ForbiddenException(
                "not_session_coach",
                "Chỉ HLV được phân công cho buổi học này hoặc Lễ tân mới điểm danh được (BR-22).");
        }

        var attendance = enrollment.Attendance;

        if (attendance is null)
        {
            attendance = new Attendance
            {
                AttendanceId = Guid.NewGuid(),
                EnrollmentId = enrollmentId
            };

            db.Set<Attendance>().Add(attendance);
        }

        var previous = attendance.Status;

        attendance.Status = status;

        // CheckInTime chỉ có nghĩa khi có mặt; đánh Absent thì xoá mốc cũ để không còn dấu vết
        // "đã đến" mâu thuẫn với trạng thái đang lưu.
        attendance.CheckInTime = status == AttendanceStatus.Present ? clock.UtcNow : null;
        attendance.CheckedInByUserId = actorUserId;

        audit.Write(new AuditEntry(
            actorUserId, "MARK_ATTENDANCE", nameof(Attendance), attendance.AttendanceId.ToString(),
            OldValue: enrollment.Attendance is null ? null : $"{{\"status\":\"{previous}\"}}",
            NewValue: $"{{\"status\":\"{status}\",\"enrollmentId\":\"{enrollmentId}\"}}"));

        await db.SaveChangesAsync(ct);

        return await GetOneAsync(attendance.AttendanceId, ct);
    }

    public async Task<IReadOnlyList<AttendanceResponse>> GetBySessionAsync(
        Guid sessionId,
        CancellationToken ct = default)
        => await db.Set<Attendance>()
            .AsNoTracking()
            .Where(a => a.Enrollment!.SessionId == sessionId)
            .Select(Projection())
            .ToListAsync(ct);

    private async Task<AttendanceResponse> GetOneAsync(Guid attendanceId, CancellationToken ct)
        => await db.Set<Attendance>().AsNoTracking().Where(a => a.AttendanceId == attendanceId).Select(Projection())
               .SingleOrDefaultAsync(ct)
           ?? throw new NotFoundException("attendance_not_found", "Không tìm thấy bản ghi điểm danh.");

    private static System.Linq.Expressions.Expression<Func<Attendance, AttendanceResponse>> Projection()
        => a => new AttendanceResponse(
            a.AttendanceId,
            a.EnrollmentId,
            a.Enrollment!.MemberId,
            a.Enrollment.Member!.Profile != null ? a.Enrollment.Member.Profile.FullName : a.Enrollment.Member.Email,
            a.Status.ToString(),
            a.CheckInTime,
            a.CheckedInByUserId);
}

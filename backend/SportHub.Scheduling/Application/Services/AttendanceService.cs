using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Điểm danh khóa học do Lễ tân hoặc coach được phân công ghi (Present/Absent). Kiểm: ghi danh thuộc ĐÚNG lớp của buổi, ghi danh còn Confirmed tại thời điểm
/// thao tác, buổi chưa bị hủy, đúng cửa sổ thời gian. Không còn NoShow tự động cho lớp nhóm và không ghi vào WorkoutResult.
/// </summary>
public sealed class AttendanceService(ISportHubDbContext db, IClock clock, IUserAccessReader users, IAuditWriter audit) : IAttendanceService
{
    public static readonly TimeSpan CorrectionWindow = TimeSpan.FromHours(24);

    public async Task<AttendanceResponse> MarkAsync(
        Guid sessionId, Guid enrollmentId, MarkAttendanceRequest request, Guid recorderUserId, CancellationToken ct = default)
    {
        var actor = await users.GetAsync(recorderUserId, ct);
        if (actor is not { IsActive: true } || actor.Role is not ("Receptionist" or "Coach"))
        {
            throw new ForbiddenException("attendance_recorder_required", "Chỉ Lễ tân hoặc coach được phân công đang hoạt động được điểm danh.");
        }
        var status = ParseStatus(request.Status);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT session_id FROM class_sessions WHERE session_id = {sessionId} FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT enrollment_id FROM enrollments WHERE enrollment_id = {enrollmentId} FOR UPDATE", ct);

        var session = await db.Set<ClassSession>().AsNoTracking().SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
                      ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");
        if (actor.Role == "Coach" && session.CoachId != recorderUserId)
            throw new ForbiddenException("session_not_assigned", "Bạn không được phân công dạy buổi này.");

        var enrollment = await db.Set<Enrollment>().AsNoTracking().SingleOrDefaultAsync(e => e.EnrollmentId == enrollmentId, ct)
                         ?? throw new NotFoundException("enrollment_not_found", "Không tìm thấy ghi danh.");

        if (enrollment.ClassId != session.ClassId)
        {
            throw new BadRequestException("enrollment_not_in_class", "Ghi danh không thuộc lớp của buổi học này.");
        }

        if (session.Status == ClassSessionStatus.Cancelled)
        {
            throw new ConflictException("session_cancelled", "Buổi học đã bị hủy — không điểm danh.");
        }

        if (enrollment.Status != EnrollmentStatus.Confirmed)
        {
            throw new ConflictException("enrollment_not_active", "Ghi danh không còn hiệu lực.");
        }

        var now = clock.UtcNow;

        if (now < session.StartAtUtc)
        {
            throw new BadRequestException("attendance_not_open", "Chưa đến giờ bắt đầu buổi học.");
        }

        if (now > session.EndAtUtc + CorrectionWindow)
        {
            throw new ConflictException("attendance_closed", "Đã quá 24 giờ sau khi buổi học kết thúc — không điểm danh/sửa được.");
        }

        var clsStatus = await db.Set<Class>().Where(c => c.ClassId == session.ClassId).Select(c => c.Status).SingleAsync(ct);
        if (clsStatus is ClassStatus.Draft or ClassStatus.Cancelled)
        {
            throw new ConflictException("class_not_active", "Khóa chưa bắt đầu hoặc đã bị hủy.");
        }

        var existing = await db.Set<Attendance>()
            .SingleOrDefaultAsync(a => a.EnrollmentId == enrollmentId && a.SessionId == sessionId, ct);
        if (existing is not null && existing.Status == status)
        {
            await tx.CommitAsync(ct);
            return ToResponse(existing);
        }

        var before = existing?.Status.ToString();
        var attendance = existing ?? new Attendance
        {
            AttendanceId = Guid.NewGuid(), EnrollmentId = enrollmentId, SessionId = sessionId,
            RecordedByUserId = recorderUserId, RecordedAt = now
        };
        attendance.Status = status;
        if (existing is null) db.Set<Attendance>().Add(attendance);
        else attendance.LastModifiedAt = now;

        audit.Write(new AuditEntry(recorderUserId, existing is null ? "MARK_COURSE_ATTENDANCE" : "CORRECT_COURSE_ATTENDANCE",
            nameof(Attendance), attendance.AttendanceId.ToString(),
            OldValue: before is null ? null : JsonSerializer.Serialize(new { status = before }),
            NewValue: JsonSerializer.Serialize(new { sessionId, enrollmentId, status = status.ToString() })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return ToResponse(attendance);
    }

    private static AttendanceStatus ParseStatus(string value)
        => value?.Trim() switch
        {
            string s when s.Equals(nameof(AttendanceStatus.Present), StringComparison.OrdinalIgnoreCase) => AttendanceStatus.Present,
            string s when s.Equals(nameof(AttendanceStatus.Absent), StringComparison.OrdinalIgnoreCase) => AttendanceStatus.Absent,
            _ => throw new BadRequestException("invalid_attendance_status", "Trạng thái điểm danh chỉ nhận Present hoặc Absent.")
        };

    private static AttendanceResponse ToResponse(Attendance a)
        => new(a.AttendanceId, a.EnrollmentId, a.SessionId, a.Status.ToString(), a.RecordedByUserId, a.RecordedAt, a.LastModifiedAt);
}

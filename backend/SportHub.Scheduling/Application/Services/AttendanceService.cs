using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Application.DTOs;
using SportHub.Scheduling.Application.Interfaces;

namespace SportHub.Scheduling.Application.Services;

/// <summary>
/// Điểm danh khóa học do Lễ tân ghi (Present/Absent). Kiểm: ghi danh thuộc ĐÚNG lớp của buổi, ghi danh còn Confirmed tại thời điểm
/// thao tác, buổi chưa bị hủy, đúng cửa sổ thời gian. Không còn NoShow tự động cho lớp nhóm và không ghi vào WorkoutResult.
/// </summary>
public sealed class AttendanceService(ISportHubDbContext db, IClock clock) : IAttendanceService
{
    public static readonly TimeSpan CorrectionWindow = TimeSpan.FromHours(24);

    public async Task<AttendanceResponse> MarkAsync(
        Guid sessionId, Guid enrollmentId, MarkAttendanceRequest request, Guid recorderUserId, CancellationToken ct = default)
    {
        var status = ParseStatus(request.Status);

        var session = await db.Set<ClassSession>().AsNoTracking().SingleOrDefaultAsync(s => s.SessionId == sessionId, ct)
                      ?? throw new NotFoundException("session_not_found", "Không tìm thấy buổi học.");

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

        // Hai lần thử: nếu hai request đầu tiên cùng chèn thì unique (enrollment, session) chặn một bên, bên đó chuyển sang cập nhật.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var existing = await db.Set<Attendance>()
                .SingleOrDefaultAsync(a => a.EnrollmentId == enrollmentId && a.SessionId == sessionId, ct);

            if (existing is not null)
            {
                existing.Status = status;
                existing.LastModifiedAt = now;
                await db.SaveChangesAsync(ct);
                return ToResponse(existing);
            }

            var created = new Attendance
            {
                AttendanceId = Guid.NewGuid(),
                EnrollmentId = enrollmentId,
                SessionId = sessionId,
                Status = status,
                RecordedByUserId = recorderUserId,
                RecordedAt = now
            };

            db.Set<Attendance>().Add(created);

            try
            {
                await db.SaveChangesAsync(ct);
                return ToResponse(created);
            }
            catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                db.Entry(created).State = EntityState.Detached;
            }
        }

        throw new ConflictException("concurrency_conflict", "Điểm danh vừa được ghi bởi người khác. Vui lòng thử lại.");
    }

    private static AttendanceStatus ParseStatus(string value)
        => Enum.TryParse<AttendanceStatus>(value, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new BadRequestException("invalid_attendance_status", "Trạng thái điểm danh chỉ nhận Present hoặc Absent.");

    private static AttendanceResponse ToResponse(Attendance a)
        => new(a.AttendanceId, a.EnrollmentId, a.SessionId, a.Status.ToString(), a.RecordedByUserId, a.RecordedAt, a.LastModifiedAt);
}

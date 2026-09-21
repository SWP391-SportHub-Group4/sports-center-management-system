using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.API.Jobs;

/// <summary>
/// BR-20 — sau khi buổi học kết thúc, ghi No-show cho các đăng ký CÒN HIỆU LỰC mà chưa có bản
/// ghi điểm danh. Đăng ký đã hủy KHÔNG bị ghi No-show.
/// BR-53 — No-show chỉ do tiến trình tự động sinh, và tiến trình này KHÔNG ghi đè bản ghi
/// điểm danh đã tồn tại.
///
/// Đồng thời đóng buổi học đã qua sang Completed (SSOT §4 / quyết định B4).
/// </summary>
public sealed class AttendanceFinalizerJob(
    IServiceProvider services,
    ILogger<AttendanceFinalizerJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(10))
{
    protected override string JobName => nameof(AttendanceFinalizerJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var db = scopedServices.GetRequiredService<SportHubDbContext>();
        var clock = scopedServices.GetRequiredService<IClock>();
        var now = clock.UtcNow;

        // Điều kiện "chưa có Attendance" nằm ngay trong truy vấn (không EXISTS bản ghi nào),
        // nên job không có đường nào ghi đè kết quả điểm danh mà Coach/Lễ tân đã nhập (BR-53).
        var pending = await db.Enrollments
            .Where(e => e.Status == EnrollmentStatus.Confirmed
                        && e.Session!.EndAtUtc <= now
                        && e.Session.Status != ClassSessionStatus.Cancelled
                        && e.Attendance == null)
            .Select(e => e.EnrollmentId)
            .Take(500)
            .ToListAsync(ct);

        foreach (var enrollmentId in pending)
        {
            db.Attendances.Add(new Attendance
            {
                AttendanceId = Guid.NewGuid(),
                EnrollmentId = enrollmentId,
                Status = AttendanceStatus.NoShow,

                // Không có thời điểm check-in (hội viên không đến) và không có người thực hiện:
                // CheckedInByUserId để null đúng như SSOT §2 mô tả cho bản ghi do job sinh.
                CheckInTime = null,
                CheckedInByUserId = null
            });
        }

        var completed = await db.ClassSessions
            .Where(s => s.Status == ClassSessionStatus.Scheduled && s.EndAtUtc <= now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, ClassSessionStatus.Completed), ct);

        if (pending.Count > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        if (pending.Count > 0 || completed > 0)
        {
            logger.LogInformation(
                "BR-20/BR-53: ghi {NoShow} No-show, đóng {Completed} buổi học đã kết thúc.",
                pending.Count, completed);
        }
    }
}

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Jobs;

public sealed class CoachAttendanceReminderJob(IServiceProvider services, ILogger<CoachAttendanceReminderJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(CoachAttendanceReminderJob);

    protected override Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => scopedServices.GetRequiredService<CoachAttendanceReminderService>().QueueDueAsync(ct);
}

public sealed class CoachAttendanceReminderService(
    SportHubDbContext db, INotificationWriter notifications, IClock clock, IConfiguration configuration)
{
    public async Task QueueDueAsync(CancellationToken ct = default)
    {
        var reminderHour = configuration.GetValue("CoachAttendanceReminders:HourLocal", 22);
        if (reminderHour is < 0 or > 23)
            throw new InvalidOperationException("CoachAttendanceReminders:HourLocal must be between 0 and 23.");

        var now = clock.UtcNow;
        var today = VietnamTime.TodayLocal(clock);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // One producer across replicas/restarts; schedule assignments stay stable while read.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 23)", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock_shared(105, 1)", ct);

        // Yesterday catches up after downtime, but only while the attendance window is open.
        foreach (var day in new[] { today.AddDays(-1), today })
        {
            var dayStart = VietnamTime.StartOfDayUtc(day);
            var dayEnd = VietnamTime.EndOfDayExclusiveUtc(day);
            if (now < dayStart.AddHours(reminderHour)) continue;

            var rows = await db.ClassSessions.AsNoTracking()
                .Where(s => s.StartAtUtc >= dayStart && s.StartAtUtc < dayEnd
                    && s.EndAtUtc <= now && s.EndAtUtc >= now.AddHours(-24)
                    && s.Status != ClassSessionStatus.Cancelled
                    && (s.Class!.Status == ClassStatus.InProgress
                        || s.Class.Status == ClassStatus.Published
                            && (s.Class.ThresholdStatus == ThresholdStatus.Met
                                || s.Class.ThresholdStatus == ThresholdStatus.WaivedByManager
                                || s.Class.BreakEvenThreshold != null
                                    && db.Enrollments.Count(e => e.ClassId == s.ClassId
                                        && e.Status == EnrollmentStatus.Confirmed) >= s.Class.BreakEvenThreshold))
                    && db.UserAccounts.Any(u => u.UserId == s.CoachId && u.Status == UserStatus.Active
                        && u.Role!.RoleName == UserRole.Coach))
                .Select(s => new
                {
                    s.CoachId, s.SessionNo, s.StartAtUtc, s.EndAtUtc,
                    ClassName = s.Class!.Name,
                    Missing = db.Enrollments.Count(e => e.ClassId == s.ClassId
                        && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
                        && e.EnrolledAt <= s.StartAtUtc
                        && db.UserAccounts.Any(u => u.UserId == e.MemberId && u.Status == UserStatus.Active)
                        && !db.Attendances.Any(a => a.SessionId == s.SessionId && a.EnrollmentId == e.EnrollmentId))
                })
                .Where(s => s.Missing > 0)
                .OrderBy(s => s.StartAtUtc)
                .ToListAsync(ct);

            foreach (var coach in rows.GroupBy(s => s.CoachId))
            {
                var date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                var sourceId = new Guid(SHA256.HashData(
                    Encoding.UTF8.GetBytes($"coach-attendance:{coach.Key:D}:{date}"))[..16]);
                // The outbox row is the durable daily receipt, including Pending/Read/Failed.
                if (await db.Set<SportHub.Notification.Domain.Entities.Notification>().AnyAsync(n =>
                        n.UserId == coach.Key && n.Channel == NotificationChannel.InApp
                        && n.SourceEventType == NotificationSourceEventType.CoachAttendanceReminder
                        && n.SourceEntityId == sourceId, ct)) continue;

                var message = new StringBuilder()
                    .AppendLine($"Attendance reminder for {date} (Vietnam time)")
                    .AppendLine($"{coach.Sum(s => s.Missing)} unmarked attendance entries across {coach.Count()} session(s).")
                    .AppendLine();
                foreach (var session in coach)
                    message.AppendLine($"{session.ClassName} · Session {session.SessionNo} · "
                        + $"{VietnamTime.ToLocal(session.StartAtUtc):HH:mm}–{VietnamTime.ToLocal(session.EndAtUtc):HH:mm}: "
                        + $"{session.Missing} not marked. Complete by {VietnamTime.ToLocal(session.EndAtUtc.AddHours(24)):dd/MM HH:mm}.");
                message.AppendLine().Append("Open Schedule → select the session → Attendance to mark each student Present or Absent.");
                notifications.Queue(new NotificationRequest(coach.Key,
                    NotificationEvents.CoachAttendanceReminder, message.ToString(), sourceId));
            }
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}

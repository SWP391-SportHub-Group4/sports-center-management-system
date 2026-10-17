using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.API.Jobs;

public sealed class MemberCourseNotificationsJob(IServiceProvider services, ILogger<MemberCourseNotificationsJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(MemberCourseNotificationsJob);

    protected override Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => scopedServices.GetRequiredService<MemberCourseNotificationService>().QueueDueAsync(ct);
}

public sealed class MemberCourseNotificationService(SportHubDbContext db, INotificationWriter notifications, IClock clock)
{
    public async Task QueueDueAsync(CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize workers across API instances; the outbox unique indexes also protect retries.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(18561016)", ct);
        var now = clock.UtcNow;
        var until = now.AddHours(24);
        var reminders = await (from session in db.ClassSessions
                               join course in db.Classes on session.ClassId equals course.ClassId
                               join enrollment in db.Enrollments on course.ClassId equals enrollment.ClassId
                               where session.Status == ClassSessionStatus.Scheduled
                                   && session.StartAtUtc > now && session.StartAtUtc <= until
                                   && (course.Status == ClassStatus.Published || course.Status == ClassStatus.InProgress)
                                   && enrollment.Status == EnrollmentStatus.Confirmed && enrollment.EndedAt == null
                               select new { enrollment.MemberId, session.SessionId, course.ClassId, course.Name,
                                   session.StartAtUtc, RoomName = session.Room!.Name }).ToListAsync(ct);
        foreach (var item in reminders)
            await QueueAsync(item.MemberId, NotificationEvents.ClassSessionReminder, item.SessionId,
                $"Reminder: {item.Name} starts at {VietnamTime.ToLocal(item.StartAtUtc):dd/MM/yyyy HH:mm} (Vietnam time), {item.RoomName}. View your schedule: /member/schedule", ct);

        var openings = await (from interest in db.Set<CourseInterest>()
                              join course in db.Classes on interest.SportId equals course.SportId
                              where interest.CancelledAtUtc == null && course.ClassId != interest.SourceClassId
                                  && course.Status == ClassStatus.Published && course.EnrollmentOpen
                                  && course.PublishedAt > interest.CreatedAtUtc && course.PublishedAt <= now
                                  && course.ReservedCount < course.Capacity
                                  && course.Sessions.Any(s => s.Status == ClassSessionStatus.Scheduled)
                                  && !course.Sessions.Any(s => s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc <= now)
                              select new { interest.MemberId, course.ClassId, course.Name }).Distinct().ToListAsync(ct);
        foreach (var item in openings)
        {
            var key = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"course-opening:{item.MemberId}:{item.ClassId}"))[..16]);
            await QueueAsync(item.MemberId, NotificationEvents.CourseInterestOpened, key,
                $"A new course you may be interested in is open: {item.Name}. View and enroll: /member/courses/{item.ClassId}. Enrollment is subject to availability.", ct);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private async Task QueueAsync(Guid memberId, string eventName, Guid sourceId, string message, CancellationToken ct)
    {
        var type = Enum.Parse<NotificationSourceEventType>(eventName);
        if (!await db.Notifications.AnyAsync(n => n.UserId == memberId && n.SourceEventType == type
                && n.SourceEntityId == sourceId && n.Channel == NotificationChannel.InApp, ct))
            notifications.Queue(new NotificationRequest(memberId, eventName, message, sourceId));
    }
}

using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Application.Services;

public sealed class ClassSessionReminderService(ISportHubDbContext db, INotificationWriter notices, IClock clock)
{
    public async Task RunAsync(CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(105, 21)", ct);
        await CourseScheduleLock.AcquireAsync(db, changingSchedule: false, ct);
        var now = clock.UtcNow;
        var rows = await (from s in db.Set<ClassSession>()
                          join e in db.Set<Enrollment>() on s.ClassId equals e.ClassId
                          where s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc > now && s.StartAtUtc <= now.AddHours(24)
                              && e.Status == EnrollmentStatus.Confirmed && e.EndedAt == null
                              && (s.Class!.Status == ClassStatus.Published || s.Class.Status == ClassStatus.InProgress)
                          select new { s.SessionId, s.StartAtUtc, s.EndAtUtc, e.MemberId, e.EnrolledAt,
                              ClassName = s.Class!.Name, RoomName = s.Room!.Name }).ToListAsync(ct);
        foreach (var r in rows)
        {
            // A late enrollment gets only its next applicable reminder, never two catch-up notices.
            var hours = r.StartAtUtc <= now.AddHours(1) ? 1 : 24;
            if (r.EnrolledAt > r.StartAtUtc.AddHours(-hours)) continue;
            if (await db.Set<ClassSessionReminder>().AnyAsync(x => x.SessionId == r.SessionId && x.MemberId == r.MemberId
                    && x.StartAtUtc == r.StartAtUtc && x.HoursBefore == hours, ct)) continue;
            var reminder = new ClassSessionReminder { ReminderId = Guid.NewGuid(), SessionId = r.SessionId,
                MemberId = r.MemberId, StartAtUtc = r.StartAtUtc, HoursBefore = hours, QueuedAtUtc = now };
            db.Set<ClassSessionReminder>().Add(reminder);
            notices.Queue(new NotificationRequest(r.MemberId, NotificationEvents.ClassSessionReminder,
                $"Upcoming lesson: {r.ClassName}, {VietnamTime.ToLocal(r.StartAtUtc):dd/MM/yyyy HH:mm}–{VietnamTime.ToLocal(r.EndAtUtc):HH:mm} (Vietnam time), {r.RoomName}.", reminder.ReminderId));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}

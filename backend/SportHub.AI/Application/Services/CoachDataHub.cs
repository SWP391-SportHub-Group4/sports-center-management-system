using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Notification.Domain.Enums;
using SportHub.Scheduling.Application.Services;
using SportHub.Scheduling.Domain.Entities;

namespace SportHub.AI.Application.Services;

/// <summary>
/// Coach-only read-only data hub. Every query is bounded and scoped to the authenticated
/// Coach. Never expose EF access or arbitrary SQL to the LLM.
/// </summary>
internal enum CoachEvidenceDomain { Overview, Notifications, Requests, Classes, Students, Schedule }

internal static class CoachDataHub
{
    internal static async Task<object> LoadEvidenceAsync(ISportHubDbContext db, Guid id, CoachEvidenceDomain domain,
        DateTime now, CancellationToken ct)
    {
        switch (domain)
        {
            case CoachEvidenceDomain.Overview:
            {
                var classes = await CoachDataScope.Classes(db, id).CountAsync(ct);
                var enrollments = await CoachDataScope.Enrollments(db, id).CountAsync(ct);
                var sessions = await db.Set<ClassSession>().AsNoTracking()
                    .CountAsync(s => s.CoachId == id && s.StartAtUtc >= now &&
                        s.StartAtUtc <= now.AddDays(30), ct);
                var requests = await db.Set<MemberSupportRequest>().AsNoTracking()
                    .Where(r => r.AssignedToUserId == id)
                    .GroupBy(r => r.Status)
                    .Select(g => new { Status = g.Key, Count = g.Count() })
                    .ToListAsync(ct);
                return new { assignedClasses = classes, activeEnrollments = enrollments,
                    teachingSessionsNext30Days = sessions, assignedSupportRequestsByStatus = requests,
                    note = "Aggregate snapshot only, 30-day upcoming session window. Do not infer missing detail." };
            }
            case CoachEvidenceDomain.Notifications:
            {
                var q = db.Set<SportHub.Notification.Domain.Entities.Notification>().AsNoTracking()
                    .Where(n => n.UserId == id && n.Channel == NotificationChannel.InApp);
                var total = await q.CountAsync(ct);
                var unread = await q.CountAsync(n => n.Status != NotificationStatus.Read, ct);
                var messages = await q.OrderByDescending(n => n.SentAt)
                    .Take(30).Select(n => new { n.Message, n.SourceEventType, n.Status, n.SentAt })
                    .ToListAsync(ct);
                return new { total, unread, records = messages, truncated = total > messages.Count,
                    note = "Notification records do not necessarily encode urgency; priority is an assessment." };
            }
            case CoachEvidenceDomain.Requests:
            {
                var q = db.Set<MemberSupportRequest>().AsNoTracking().Where(r => r.AssignedToUserId == id);
                var total = await q.CountAsync(ct);
                var rows = await q.OrderByDescending(r => r.CreatedAt).Take(40)
                    .Select(r => new { r.Subject, r.Category, r.Status, r.CreatedAt, r.SlaDueAtUtc,
                        r.ClosedAt, r.ProgressNote })
                    .ToListAsync(ct);
                return new { total, assignedRequests = rows, truncated = total > rows.Count,
                    note = "Only support requests assigned to this Coach. Absence requests have another lifecycle." };
            }
            case CoachEvidenceDomain.Classes:
            {
                var q = CoachDataScope.Classes(db, id);
                var total = await q.CountAsync(ct);
                var rows = await q.OrderBy(c => c.Name).Take(40)
                    .Select(c => new { c.Name, c.Code, sport = c.Sport != null ? c.Sport.Name : null,
                        status = c.Status.ToString(), c.Capacity, c.ConfirmedCount, c.ReservedCount,
                        c.NumSessions, c.EnrollmentOpen, c.StartDate, c.Price,
                        room = c.DefaultRoom != null ? c.DefaultRoom.Name : null,
                        availableSeats = c.Capacity - c.ReservedCount })
                    .ToListAsync(ct);
                return new { total, classes = rows, truncated = total > rows.Count,
                    note = "Only directly assigned Published/InProgress classes. Substitute session assignments may differ." };
            }
            case CoachEvidenceDomain.Students:
            {
                var e = CoachDataScope.Enrollments(db, id);
                var total = await e.CountAsync(ct);
                var rows = await e.OrderBy(x => x.ClassId).Take(100)
                    .Join(db.Set<UserAccount>().AsNoTracking(), enrollment => enrollment.MemberId,
                        account => account.UserId, (enrollment, account) => new
                        { enrollment.ClassId,
                            className = enrollment.Class != null ? enrollment.Class.Name : null,
                            studentName = account.Profile != null ? account.Profile.FullName : null })
                    .ToListAsync(ct);
                return new { totalEnrollments = total, enrolledStudents = rows,
                    truncated = total > rows.Count,
                    note = "Confirmed active enrolled students of assigned Coach classes only. " +
                        "No fitness/health data or inferred performance ranking is included." };
            }
            case CoachEvidenceDomain.Schedule:
            {
                var q = db.Set<ClassSession>().AsNoTracking()
                    .Where(s => s.CoachId == id && s.StartAtUtc >= now.AddDays(-30) &&
                        s.StartAtUtc <= now.AddDays(90));
                var total = await q.CountAsync(ct);
                var rows = await q.OrderBy(s => s.StartAtUtc).Take(80)
                    .Select(s => new { className = s.Class != null ? s.Class.Name : null,
                        s.SessionNo, s.StartAtUtc, s.EndAtUtc,
                        status = s.Status.ToString(), room = s.Room != null ? s.Room.Name : null })
                    .ToListAsync(ct);
                return new { totalInWindow = total, sessions = rows, truncated = total > rows.Count,
                    fromUtc = now.AddDays(-30), toUtc = now.AddDays(90),
                    note = "Window-bound schedule evidence; no claims about sessions outside the window." };
            }
            default: return new { unavailable = true };
        }
    }
}

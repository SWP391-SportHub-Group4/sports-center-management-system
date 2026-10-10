using Microsoft.EntityFrameworkCore;
using SportHub.Notification.Application.Interfaces;
using SportHub.Notification.Application.Services;

namespace SportHub.API.Persistence;

// Resolve polymorphic source IDs in the host, where all business modules are available.
// Only return destinations backed by records owned by this notification's recipient.
public sealed class NotificationActionReader(SportHubDbContext db) : INotificationActionReader
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetMemberActionsAsync(
        Guid userId, IReadOnlyList<NotificationResponse> notifications, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        foreach (var group in notifications.Where(n => n.SourceEntityId.HasValue).GroupBy(n => n.SourceEventType))
        {
            var ids = group.Select(n => n.SourceEntityId!.Value).Distinct().ToArray();
            var links = new Dictionary<Guid, string>();
            switch (group.Key)
            {
                case "ClassTeachingUpdated":
                    var teaching = await db.Set<SportHub.Scheduling.Domain.Entities.ClassTeachingRecord>()
                        .Where(x => ids.Contains(x.RecordId) && (x.MemberId == null || x.MemberId == userId))
                        .Where(x => db.Enrollments.Any(e => e.ClassId == x.ClassId && e.MemberId == userId))
                        .Select(x => new { x.RecordId, x.ClassId }).ToListAsync(ct);
                    foreach (var record in teaching)
                        links[record.RecordId] = $"/member/schedule?course={record.ClassId}";
                    break;
                case "InvoiceCreated":
                case "PaymentReceived":
                    foreach (var id in await db.Invoices.Where(x => x.MemberId == userId && ids.Contains(x.InvoiceId))
                                 .Select(x => x.InvoiceId).ToListAsync(ct))
                        links[id] = $"/member/invoices/{id}";
                    break;
                case "ClassThresholdAtRisk":
                    foreach (var id in await db.ThresholdResponses.Where(x => x.MemberId == userId && ids.Contains(x.ThresholdResponseId))
                                 .Select(x => x.ThresholdResponseId).ToListAsync(ct))
                        links[id] = $"/member/threshold?responseId={id}";
                    break;
                case "IncidentResolution":
                    foreach (var id in await db.CourtRentals.Where(x => x.MemberId == userId && ids.Contains(x.CourtRentalId))
                                 .Select(x => x.CourtRentalId).ToListAsync(ct))
                        links[id] = $"/member/rentals/{id}";
                    break;
                case "ScheduleChanged":
                case "ClassCancelled":
                    foreach (var id in await db.PtSessions.Where(x => x.MemberId == userId && ids.Contains(x.SessionId))
                                 .Select(x => x.SessionId).ToListAsync(ct))
                        links[id] = $"/member/pt/sessions/{id}";
                    var sessions = await (from s in db.ClassSessions
                                          where ids.Contains(s.SessionId)
                                          where db.Enrollments.Any(e => e.ClassId == s.ClassId && e.MemberId == userId)
                                          select new { s.SessionId, s.ClassId }).ToListAsync(ct);
                    foreach (var s in sessions)
                        links[s.SessionId] = $"/member/courses/{s.ClassId}";
                    foreach (var e in await db.Enrollments.Where(x => x.MemberId == userId && ids.Contains(x.EnrollmentId))
                                 .Select(x => new { x.EnrollmentId, x.ClassId }).ToListAsync(ct))
                        links[e.EnrollmentId] = $"/member/courses/{e.ClassId}";
                    foreach (var id in await db.PtCoachChangeRequests.Where(x => x.MemberId == userId && ids.Contains(x.RequestId))
                                 .Select(x => x.RequestId).ToListAsync(ct))
                        links[id] = "/member/services?tab=pt";
                    break;
                case "PackageExpiring":
                    foreach (var id in await db.MemberPackages.Where(x => x.MemberId == userId && ids.Contains(x.MemberPackageId))
                                 .Select(x => x.MemberPackageId).ToListAsync(ct))
                        links[id] = "/member/services";
                    break;
                case "RefundCompleted":
                    foreach (var n in group) result[n.NotificationId] = "/member/finance?tab=wallet";
                    break;
            }
            foreach (var n in group)
                if (links.TryGetValue(n.SourceEntityId!.Value, out var url)) result[n.NotificationId] = url;
        }
        return result;
    }
}

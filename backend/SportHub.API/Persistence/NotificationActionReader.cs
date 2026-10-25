using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Notification.Application.Interfaces;
using SportHub.Notification.Application.Services;

namespace SportHub.API.Persistence;

// Resolve polymorphic source IDs in the host, where all business modules are available.
// Only return destinations backed by records owned by this notification's recipient.
public sealed class NotificationActionReader(SportHubDbContext db, SportHub.BuildingBlocks.SharedKernel.Time.IClock clock) : INotificationActionReader
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetInvoiceNoticeMessagesAsync(
        Guid userId, IReadOnlyList<NotificationResponse> notifications, CancellationToken ct)
    {
        var notices = notifications.Where(n => n.SourceEventType == "InvoiceCreated" && n.SourceEntityId.HasValue).ToList();
        if (notices.Count == 0) return new Dictionary<Guid, string>();

        var ids = notices.Select(n => n.SourceEntityId!.Value).Distinct().ToArray();
        var invoices = await db.Invoices.AsNoTracking()
            .Where(i => i.MemberId == userId && ids.Contains(i.InvoiceId) && i.Status != InvoiceStatus.Issued)
            .Select(i => new
            {
                i.InvoiceId, i.InvoiceNumber, i.Status,
                CheckoutState = db.Set<CheckoutSession>()
                    .Where(s => s.CheckoutSessionId == i.CheckoutCycleId)
                    .Select(s => s.State).FirstOrDefault()
            }).ToListAsync(ct);
        var messages = invoices.ToDictionary(i => i.InvoiceId, i => i.Status switch
        {
            InvoiceStatus.Void when i.CheckoutState == "Cancelled" =>
                $"Invoice {i.InvoiceNumber} was cancelled. No payment is due.",
            InvoiceStatus.Void when i.CheckoutState == "Expired" =>
                $"Invoice {i.InvoiceNumber} expired. No payment is due.",
            InvoiceStatus.Void => $"Invoice {i.InvoiceNumber} is closed. No payment is due.",
            InvoiceStatus.Paid or InvoiceStatus.PaidAfterReconciliation =>
                $"Invoice {i.InvoiceNumber} has been paid. No further payment is due.",
            InvoiceStatus.Compensated =>
                $"Invoice {i.InvoiceNumber} is closed after compensation. No payment is due.",
            _ => $"Invoice {i.InvoiceNumber} is closed. No payment is due."
        });
        return notices.Where(n => messages.ContainsKey(n.SourceEntityId!.Value))
            .ToDictionary(n => n.NotificationId, n => messages[n.SourceEntityId!.Value]);
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetMemberActionsAsync(
        Guid userId, IReadOnlyList<NotificationResponse> notifications, CancellationToken ct)
    {
        var currentEnrollments = SportHub.Scheduling.Application.Services.MemberClassAccess.Current(db, userId, clock.UtcNow);
        var result = new Dictionary<Guid, string>();
        var isSupportManager = notifications.Any(n => n.SourceEventType is "SupportSlaReminder" or "SupportPayoutNotReceived" or "PaymentUnactivated")
            && await db.UserAccounts.AnyAsync(u => u.UserId == userId
                && u.Status == SportHub.Identity.Domain.Enums.UserStatus.Active
                && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.CenterManager, ct);
        foreach (var group in notifications.Where(n => n.SourceEntityId.HasValue).GroupBy(n => n.SourceEventType))
        {
            var ids = group.Select(n => n.SourceEntityId!.Value).Distinct().ToArray();
            var links = new Dictionary<Guid, string>();
            switch (group.Key)
            {
                case "SupportSlaReminder":
                    if (isSupportManager)
                        foreach (var reminder in await db.Set<SportHub.Identity.Domain.Entities.MemberSupportEvent>()
                            .Where(e => ids.Contains(e.EventId) && e.Type == "SLA_REMINDER_SENT" && e.TargetUserId == userId)
                            .Join(db.Set<SportHub.Identity.Domain.Entities.MemberSupportRequest>(),
                                e => e.RequestId, r => r.RequestId, (e, r) => new { e.EventId, r.RequestId }).ToListAsync(ct))
                            links[reminder.EventId] = $"/manager/requests?type=support&overdue=1&request={reminder.RequestId}";
                    break;
                case "SupportPayoutNotReceived":
                    if (isSupportManager)
                        foreach (var report in await db.Set<SportHub.Identity.Domain.Entities.MemberSupportEvent>()
                            .Where(e => ids.Contains(e.EventId) && e.Type == "MEMBER_REPORTED_NOT_RECEIVED")
                            .Join(db.Set<SportHub.Identity.Domain.Entities.MemberSupportRequest>().Where(r => r.Category == "PAYMENT"),
                                e => e.RequestId, r => r.RequestId, (e, r) => new { e.EventId, r.RequestId }).ToListAsync(ct))
                            links[report.EventId] = $"/manager/requests?type=support&request={report.RequestId}";
                    break;
                case "SupportRequestAssigned":
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId
                        && (u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach
                            || u.Role.RoleName == SportHub.Identity.Domain.Enums.UserRole.SystemAdministrator), ct))
                        foreach (var assignment in await db.Set<SportHub.Identity.Domain.Entities.MemberSupportEvent>()
                            .Where(e => ids.Contains(e.EventId) && e.TargetUserId == userId)
                            .Join(db.Set<SportHub.Identity.Domain.Entities.MemberSupportRequest>().Where(r => r.AssignedToUserId == userId),
                                e => e.RequestId, r => r.RequestId, (e, r) => new { e.EventId, r.RequestId }).ToListAsync(ct))
                            links[assignment.EventId] = await db.UserAccounts.AnyAsync(u => u.UserId == userId
                                && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.SystemAdministrator, ct)
                                ? $"/admin/support?request={assignment.RequestId}"
                                : $"/coach/support?request={assignment.RequestId}";
                    break;
                case "CoachAttendanceReminder":
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId
                        && u.Status == SportHub.Identity.Domain.Enums.UserStatus.Active
                        && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach, ct))
                        foreach (var id in ids) links[id] = "/coach/schedule";
                    break;
                case "ClassSessionReminder":
                    foreach (var id in await db.ClassSessions.Where(s => ids.Contains(s.SessionId)
                        && s.Status == SportHub.Scheduling.Domain.Enums.ClassSessionStatus.Scheduled
                        && db.Enrollments.Any(e => e.ClassId == s.ClassId && e.MemberId == userId
                            && e.Status == SportHub.Scheduling.Domain.Enums.EnrollmentStatus.Confirmed && e.EndedAt == null))
                        .Select(s => s.SessionId).ToListAsync(ct))
                        links[id] = $"/member/schedule?event=class%3A{id}";
                    var reminders = await db.Set<SportHub.Scheduling.Domain.Entities.ClassSessionReminder>()
                        .Where(r => ids.Contains(r.ReminderId) && r.MemberId == userId)
                        .Join(db.ClassSessions, r => r.SessionId, s => s.SessionId, (r, s) => new { r.ReminderId, s.ClassId })
                        .ToListAsync(ct);
                    foreach (var r in reminders) links[r.ReminderId] = $"/member/schedule?course={r.ClassId}";
                    break;
                case "ClassSessionChangeRequested":
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.CenterManager, ct))
                        foreach (var id in ids)
                            links[id] = "/manager/requests?type=coach";
                    break;
                case "AvatarReported":
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.SystemAdministrator, ct))
                        foreach (var id in ids) links[id] = "/admin/users";
                    break;
                case "CoachCoverageRequired":
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.CenterManager, ct))
                    {
                        // Legacy notices used a Coach ID. Current notices use a unique account transition ID,
                        // preserving repeat account transitions with a direct profile link.
                        foreach (var id in await db.UserAccounts.Where(u => ids.Contains(u.UserId) && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach).Select(u => u.UserId).ToListAsync(ct))
                            links[id] = $"/manager/coaches/{id}?tab=overview";
                        foreach (var id in ids.Where(id => !links.ContainsKey(id)))
                        {
                            var transition = System.Text.Json.JsonSerializer.Serialize(new { value = new { transitionId = id } });
                            var target = await db.Set<SportHub.Audit.Domain.Entities.AuditLog>().AsNoTracking()
                                .Where(a => (a.Action == AccountAuditActions.DeactivateUserAccount
                                        || a.Action == AccountAuditActions.LockUserAccount) && a.TargetEntity == "UserAccount"
                                    && a.NewValue != null && EF.Functions.JsonContains(a.NewValue, transition))
                                .Select(a => a.TargetId).FirstOrDefaultAsync(ct);
                            if (Guid.TryParse(target, out var coachId) && await db.UserAccounts.AnyAsync(u =>
                                u.UserId == coachId && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach, ct))
                                links[id] = $"/manager/coaches/{coachId}?tab=overview";
                        }
                    }
                    break;
                case "ClassSessionChangeReviewed":
                    foreach (var id in await db.Set<SportHub.Scheduling.Domain.Entities.ClassSessionChangeRequest>().Where(r => ids.Contains(r.RequestId) && r.RequestedByUserId == userId).Select(r => r.RequestId).ToListAsync(ct))
                        links[id] = "/coach/change-requests";
                    break;
                case "ClassTeachingUpdated":
                    var teaching = await db.Set<SportHub.Scheduling.Domain.Entities.ClassTeachingRecord>()
                        .Where(x => ids.Contains(x.RecordId) && (x.MemberId == null || x.MemberId == userId))
                        .Where(x => currentEnrollments.Any(e => e.ClassId == x.ClassId))
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
                case "PaymentConvertedToPoints":
                    foreach (var id in await db.Invoices.Where(x => x.MemberId == userId && ids.Contains(x.InvoiceId))
                                 .Select(x => x.InvoiceId).ToListAsync(ct))
                        links[id] = $"/member/invoices/{id}";
                    break;
                case "PaymentUnactivated":
                    // Resolve the gateway event to its invoice; managers use their own finance workspace.
                    foreach (var e in await (from ev in db.Set<SportHub.Payment.Domain.Entities.VerifiedGatewayEvent>()
                                             join a in db.Set<SportHub.Payment.Domain.Entities.PaymentAttempt>()
                                                 on ev.PaymentAttemptId equals a.PaymentAttemptId
                                             join i in db.Invoices on a.InvoiceId equals i.InvoiceId
                                             where ids.Contains(ev.VerifiedGatewayEventId) && (i.MemberId == userId || isSupportManager)
                                             select new { ev.VerifiedGatewayEventId, i.InvoiceId }).ToListAsync(ct))
                        links[e.VerifiedGatewayEventId] = isSupportManager
                            ? $"/manager/finance?invoiceId={e.InvoiceId}"
                            : $"/member/invoices/{e.InvoiceId}";
                    break;
                case "SupportPayoutRecorded":
                    foreach (var p in await (from payout in db.Set<SportHub.Identity.Domain.Entities.MemberSupportPayout>()
                                             join r in db.Set<SportHub.Identity.Domain.Entities.MemberSupportRequest>()
                                                 on payout.RequestId equals r.RequestId
                                             where ids.Contains(payout.PayoutId) && r.MemberId == userId
                                             select new { payout.PayoutId, payout.RequestId }).ToListAsync(ct))
                        links[p.PayoutId] = $"/member/help?tab=requests&requestId={p.RequestId}";
                    break;
                case "SupportRequestReceived":
                    foreach (var id in await db.Set<SportHub.Identity.Domain.Entities.MemberSupportRequest>()
                                 .Where(r => r.MemberId == userId && ids.Contains(r.RequestId))
                                 .Select(r => r.RequestId).ToListAsync(ct))
                        links[id] = $"/member/help?tab=requests&requestId={id}";
                    break;
                case "ClassThresholdAtRisk":
                case "ClassThresholdConfirmed":
                    foreach (var id in await db.ThresholdResponses.Where(x => x.MemberId == userId && ids.Contains(x.ThresholdResponseId))
                                 .Select(x => x.ThresholdResponseId).ToListAsync(ct))
                        links[id] = $"/member/threshold?responseId={id}";
                    var role = await db.UserAccounts.Where(u => u.UserId == userId).Select(u => u.Role!.RoleName).SingleAsync(ct);
                    if (role == SportHub.Identity.Domain.Enums.UserRole.CenterManager)
                    {
                        foreach (var s in await db.ClassSessions.Where(s => ids.Contains(s.SessionId))
                            .Select(s => new { s.SessionId, s.ClassId }).ToListAsync(ct))
                            links[s.SessionId] = $"/manager/classes/{s.ClassId}?tab=threshold";
                    }
                    else if (role == SportHub.Identity.Domain.Enums.UserRole.Coach)
                    {
                        foreach (var s in await db.ClassSessions.Where(s => ids.Contains(s.SessionId)
                            && (s.CoachId == userId || db.Classes.Any(c => c.ClassId == s.ClassId && c.CoachId == userId)))
                            .Select(s => new { s.SessionId, s.ClassId }).ToListAsync(ct))
                            links[s.SessionId] = $"/coach/classes/{s.ClassId}";
                    }
                    break;
                case "IncidentResolution":
                    foreach (var id in await db.CourtRentals.Where(x => x.MemberId == userId && ids.Contains(x.CourtRentalId))
                                 .Select(x => x.CourtRentalId).ToListAsync(ct))
                        links[id] = $"/member/rentals/{id}";
                    break;
                case "ScheduleChanged":
                case "ClassCancelled":
                    foreach (var id in await db.ThresholdResponses.Where(r => r.MemberId == userId && ids.Contains(r.ThresholdResponseId))
                        .Select(r => r.ThresholdResponseId).ToListAsync(ct))
                        links[id] = $"/member/services?section=courses&view=owned&responseId={id}";
                    if (await db.UserAccounts.AnyAsync(u => u.UserId == userId && u.Role!.RoleName == SportHub.Identity.Domain.Enums.UserRole.Coach, ct))
                        foreach (var id in ids) links[id] = "/coach/schedule";
                    var sessions = await (from s in db.ClassSessions
                                          where ids.Contains(s.SessionId)
                                          where db.Enrollments.Any(e => e.ClassId == s.ClassId && e.MemberId == userId)
                                          select new { s.SessionId, s.ClassId }).ToListAsync(ct);
                    foreach (var s in sessions)
                        links[s.SessionId] = $"/member/courses/{s.ClassId}";
                    foreach (var id in await db.ClassSessions.Where(s => ids.Contains(s.SessionId) && s.CoachId == userId).Select(s => s.SessionId).ToListAsync(ct))
                        links[id] = "/coach/schedule";
                    foreach (var e in await db.Enrollments.Where(x => x.MemberId == userId && ids.Contains(x.EnrollmentId))
                                 .Select(x => new { x.EnrollmentId, x.ClassId }).ToListAsync(ct))
                        links[e.EnrollmentId] = $"/member/courses/{e.ClassId}";
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
        // Legacy payout notices used unpersisted random IDs. Keep them actionable
        // without guessing a request identity from notification text.
        if (isSupportManager)
            foreach (var notice in notifications.Where(n => n.SourceEventType is "SupportSlaReminder" or "SupportPayoutNotReceived"))
                result.TryAdd(notice.NotificationId, notice.SourceEventType == "SupportSlaReminder"
                    ? "/manager/requests?type=support&overdue=1"
                    : "/manager/requests?type=support");
        // Older staff alerts did not store a source ID. Resolve only an exact, unambiguous class name.
        foreach (var notice in notifications.Where(n => n.SourceEntityId is null && n.SourceEventType == "ClassThresholdAtRisk"))
        {
            var match = System.Text.RegularExpressions.Regex.Match(notice.Message,
                @"^Course (.+?) (?:is below its enrollment threshold|has \d+/\d+ confirmed enrollments)");
            if (!match.Success) continue;
            var role = await db.UserAccounts.Where(u => u.UserId == userId).Select(u => u.Role!.RoleName).SingleAsync(ct);
            if (role != SportHub.Identity.Domain.Enums.UserRole.CenterManager) continue;
            var name = match.Groups[1].Value;
            var matches = await db.Classes.Where(c => c.Name == name).Select(c => c.ClassId).Take(2).ToListAsync(ct);
            if (matches.Count == 1) result[notice.NotificationId] = $"/manager/classes/{matches[0]}?tab=threshold";
        }
        return result;
    }
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Email;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Application.Commands;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Application.Services;

/// <summary>Enrolled classes may only be cancelled after a below-threshold decision, before teaching is completed.</summary>
public sealed class CourseCancellationService(ISportHubDbContext db, IRefundCreditService refunds,
    ICheckoutLifecycleService checkouts, IClassEnrollmentFulfillment enrollments, IOccupancyService occupancy,
    IAuditWriter audit, INotificationWriter notifications, IClock clock, IUserAccessReader users,
    ISystemSettingProvider settings, IConfiguration configuration)
{
    public async Task<CourseCancellationPreview> PreviewAsync(int classId, CancellationToken ct = default)
    {
        var course = await db.Set<Class>().AsNoTracking().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        var members = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == EnrollmentStatus.Confirmed && x.EndedAt == null).OrderBy(x => x.EnrollmentId).ToListAsync(ct);
        var holds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == SeatHoldStatus.Active).OrderBy(x => x.HoldId).ToListAsync(ct);
        var sessions = await db.Set<ClassSession>().AsNoTracking().Where(x => x.ClassId == classId).ToListAsync(ct);
        var originals = sessions.Where(x => !x.IsMakeup).ToList();
        var completedMakeups = sessions.Where(x => x.IsMakeup && x.Status == ClassSessionStatus.Completed
            && x.RescheduledFromSessionId != null).Select(x => x.RescheduledFromSessionId).ToHashSet();
        var remaining = originals.Count(x => x.Status != ClassSessionStatus.Completed && !completedMakeups.Contains(x.SessionId));
        var quotes = new List<CourseCancellationMember>();
        var automaticRefund = ClassCancellationRules.IsBelowThresholdDecision(course, members.Count)
            && members.All(m => m.InvoiceItemId.HasValue)
            && sessions.All(s => s.Status != ClassSessionStatus.Completed);
        if (automaticRefund)
            foreach (var member in members.Where(m => m.InvoiceItemId.HasValue))
            {
                var value = await refunds.GetRemainingItemValueVndAsync(member.InvoiceItemId!.Value, ct);
                quotes.Add(new(member.EnrollmentId, member.MemberId, member.InvoiceItemId.Value, value, checked((int)(value / 1000))));
            }
        var canCancel = course.Status is not (ClassStatus.Completed or ClassStatus.Cancelled)
            && (members.Count == 0 || automaticRefund);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            { course.Version, course.Status, course.ThresholdStatus, course.BreakEvenThreshold, automaticRefund, remaining,
                total = originals.Count, quotes, holds = holds.Select(x => new { x.HoldId, x.InvoiceId }) }))));
        return new(canCancel, course.Version, originals.Count, remaining, members.Count, holds.Count,
            quotes.Sum(x => x.RefundPoints), fingerprint, quotes, automaticRefund);
    }

    public async Task CancelAsync(int classId, CancelClassRequest request, Guid actorId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("class_cancel_reason_required", "Class cancel reason required.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"threshold-class-expiry:{classId}"}, 0))", ct);
        var selected = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed).ToListAsync(ct);
        var holds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == SeatHoldStatus.Active).ToListAsync(ct);
        var responses = await db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.ClassId == classId).ToListAsync(ct);
        var items = selected.Where(x => x.InvoiceItemId != null).Select(x => x.InvoiceItemId!.Value).Distinct().ToList();
        var invoices = holds.Where(x => x.InvoiceId != null).Select(x => x.InvoiceId!.Value)
            .Concat(responses.Where(x => x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment
                && x.AdditionalInvoiceId != null).Select(x => x.AdditionalInvoiceId!.Value)).Distinct().ToList();
        // Payment/checkout takes invoice then wallet then entitlement then class; follow that order.
        await refunds.LockBatchAsync(items, invoices, ct);
        foreach (var response in responses.OrderBy(x => x.ThresholdResponseId))
        {
            // Choice submission can already hold a response while waiting for its invoice.
            // Never wait in the opposite order: roll back and refresh the cancellation preview.
            var locked = await db.Set<ThresholdResponse>().FromSqlInterpolated(
                $"SELECT * FROM class_threshold_responses WHERE threshold_response_id = {response.ThresholdResponseId} FOR UPDATE SKIP LOCKED").ToListAsync(ct);
            if (locked.Count == 0)
                throw new ConflictException("class_cancellation_changed", "Class cancellation changed.");
        }
        foreach (var hold in holds.OrderBy(x => x.HoldId))
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM seat_holds WHERE hold_id = {hold.HoldId} FOR UPDATE", ct);
        foreach (var member in selected.OrderBy(x => x.EnrollmentId))
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM enrollments WHERE enrollment_id = {member.EnrollmentId} FOR UPDATE", ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        var course = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        await db.Entry(course).ReloadAsync(ct);
        if (course.Status == ClassStatus.Cancelled) { await tx.CommitAsync(ct); return; }
        var current = await PreviewAsync(classId, ct);
        if (!current.RefundsImmediately)
            await ClassCancellationRules.EnsureNoConfirmedEnrollmentsAsync(db, classId, ct);
        if (!current.CanCancel)
            throw new ConflictException("class_not_cancellable", "Class not cancellable.");
        var currentHolds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == SeatHoldStatus.Active).ToListAsync(ct);
        var currentResponses = await db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        if (current.Members.Any(x => !items.Contains(x.InvoiceItemId))
            || currentHolds.Any(x => !holds.Any(h => h.HoldId == x.HoldId) || x.InvoiceId != null && !invoices.Contains(x.InvoiceId.Value))
            || currentResponses.Any(x => !responses.Any(r => r.ThresholdResponseId == x.ThresholdResponseId)
                || x.AdditionalInvoiceId != null && !invoices.Contains(x.AdditionalInvoiceId.Value)))
            throw new ConflictException("class_cancellation_changed", "Class cancellation changed.");
        if ((current.ConfirmedCount > 0 || current.ActiveHoldCount > 0) && request.PreviewToken != current.PreviewToken
            || request.PreviewToken != null && request.PreviewToken != current.PreviewToken)
            throw new ConflictException("class_cancellation_changed", "Class cancellation changed.");
        foreach (var invoiceId in invoices.Order())
            await checkouts.ReleaseForSystemAsync(invoiceId, "Course cancelled by the center", ct);
        foreach (var hold in currentHolds.Where(x => x.InvoiceId == null)) await enrollments.ReleaseAsync(hold.HoldId, ct);
        // Entitlement services update counts using SQL; reload before saving the class.
        await db.Entry(course).ReloadAsync(ct);
        var sessions = await db.Set<ClassSession>().Where(x => x.ClassId == classId && x.Status == ClassSessionStatus.Scheduled).ToListAsync(ct);
        foreach (var session in sessions)
        {
            session.Status = ClassSessionStatus.Cancelled;
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, session.SessionId, ct);
            await new ClassScheduleEffects(db, users, notifications, audit, clock).ApplyAsync(course, session, actorId,
                session.CoachId, session.SessionId, session.CoachId,
                $"Session {session.SessionNo} · {course.Name} was cancelled because the course was cancelled. Reason: {request.Reason.Trim()}", ct,
                "COURSE_CANCELLED", request.Reason.Trim());
        }
        var pendingResponses = await db.Set<ThresholdResponse>().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        foreach (var response in pendingResponses) { response.ResolutionStatus = ThresholdResolutionStatus.Expired; response.ResolvedAtUtc = clock.UtcNow; }
        foreach (var member in current.Members)
        {
            var result = await refunds.CreditAsync(new RefundCreditRequest(member.InvoiceItemId, 100,
                "Points refunded immediately after the Manager cancelled a below-threshold class", member.EnrollmentId), ct);
            await enrollments.CancelAsync(member.InvoiceItemId, EnrollmentEndReason.CancelledByCenter, ct);
            var message = $"Course {course.Name} was cancelled because it did not meet its enrollment threshold. {result.PointsCredited} points were returned to your wallet. Reason: {request.Reason.Trim()}";
            notifications.Queue(new(member.MemberId, NotificationEvents.ClassCancelled, message, member.EnrollmentId));
            var recipient = await users.GetAsync(member.MemberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new(member.MemberId, recipient.Email, NotificationEvents.ClassCancelled,
                    member.EnrollmentId, "SportHub - Class cancelled and points refunded", EmailContent.Paragraph(message)));
        }
        if (course.CoachId is Guid coachId)
        {
            var eventId = Guid.NewGuid();
            var message = $"Course {course.Name} was cancelled by the Manager because it did not meet its enrollment threshold. Enrolled members have received their points refunds. Reason: {request.Reason.Trim()}";
            notifications.Queue(new(coachId, NotificationEvents.ClassCancelled, message, eventId));
            var coach = await users.GetAsync(coachId, ct);
            if (coach is not null)
                notifications.QueueEmail(new(coachId, coach.Email, NotificationEvents.ClassCancelled,
                    eventId, "SportHub - Teaching class cancelled", EmailContent.Paragraph(message)));
        }
        await db.Entry(course).ReloadAsync(ct);
        course.ThresholdResponseDeadlineUtc = null;
        course.EnrollmentOpen = false;
        course.Status = ClassStatus.Cancelled; course.Version++;
        audit.Write(new(actorId, "CANCEL_CLASS", nameof(Class), classId.ToString(),
            NewValue: JsonSerializer.Serialize(new { current.ConfirmedCount, current.ActiveHoldCount, current.RefundPoints,
                current.SessionsNotProvided, current.RefundsImmediately, course.ThresholdResponseDeadlineUtc }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
public sealed record CourseCancellationMember(Guid EnrollmentId, Guid MemberId, Guid InvoiceItemId, decimal RemainingPaidValueVnd, int RefundPoints);
public sealed record CourseCancellationPreview(bool CanCancel, int Version, int TotalSessions, int SessionsNotProvided,
    int ConfirmedCount, int ActiveHoldCount, int RefundPoints, string PreviewToken, IReadOnlyList<CourseCancellationMember> Members,
    bool RefundsImmediately = false);

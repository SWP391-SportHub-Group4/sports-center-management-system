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

/// <summary>Course cancellation, with a dedicated override when the Manager deactivates its sport.</summary>
public sealed class CourseCancellationService(ISportHubDbContext db, IRefundCreditService refunds,
    ICheckoutLifecycleService checkouts, IClassEnrollmentFulfillment enrollments, IOccupancyService occupancy,
    IAuditWriter audit, INotificationWriter notifications, IClock clock, IUserAccessReader users)
{
    public Task<CourseCancellationPreview> PreviewAsync(int classId, CancellationToken ct = default)
        => PreviewCoreAsync(classId, false, ct);

    private async Task<CourseCancellationPreview> PreviewCoreAsync(int classId, bool sportDeactivated, CancellationToken ct)
    {
        var course = await db.Set<Class>().AsNoTracking().SingleOrDefaultAsync(x => x.ClassId == classId, ct)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        var members = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == EnrollmentStatus.Confirmed && x.EndedAt == null).OrderBy(x => x.EnrollmentId).ToListAsync(ct);
        var holds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId
            && x.Status == SeatHoldStatus.Active).OrderBy(x => x.HoldId).ToListAsync(ct);
        var sessions = await db.Set<ClassSession>().AsNoTracking().Where(x => x.ClassId == classId).ToListAsync(ct);
        var (total, remaining) = ClassCancellationSessions.Count(sessions);
        var quotes = new List<CourseCancellationMember>();
        var automaticRefund = sportDeactivated || members.All(m => m.InvoiceItemId.HasValue);
        if (automaticRefund)
            foreach (var member in members.Where(m => m.InvoiceItemId.HasValue))
            {
                var value = await refunds.GetRemainingItemValueVndAsync(member.InvoiceItemId!.Value, ct,
                    sportDeactivated && total > 0 ? new RefundFraction(remaining, total) : null);
                var recipient = await users.GetAsync(member.MemberId, ct);
                quotes.Add(new(member.EnrollmentId, member.MemberId, member.InvoiceItemId.Value, value,
                    checked((int)(value / 1000)), recipient?.FullName ?? member.MemberId.ToString()));
            }
        var canCancel = course.Status is not (ClassStatus.Completed or ClassStatus.Cancelled)
            && (members.Count == 0 || automaticRefund);
        string? blockedReason = canCancel ? null
            : course.Status is ClassStatus.Completed or ClassStatus.Cancelled ? "class_closed"
            : "enrollment_payment_missing";
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            { course.Version, course.Status, course.ThresholdStatus, course.BreakEvenThreshold, automaticRefund, remaining,
                total, quotes, holds = holds.Select(x => new { x.HoldId, x.InvoiceId }) }))));
        return new(canCancel, course.Version, total, remaining, members.Count, holds.Count,
            quotes.Sum(x => x.RefundPoints), fingerprint, quotes, automaticRefund, blockedReason);
    }

    public Task CancelAsync(int classId, CancelClassRequest request, Guid actorId, CancellationToken ct = default)
        => CancelCoreAsync(classId, request, actorId, false, ct);

    internal Task CancelForSportDeactivationAsync(int classId, Guid actorId, CancellationToken ct)
        => CancelCoreAsync(classId, new CancelClassRequest { Reason = "Sport deactivated by the Manager" }, actorId, true, ct);

    private async Task CancelCoreAsync(int classId, CancelClassRequest request, Guid actorId, bool sportDeactivated, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("class_cancel_reason_required", "Class cancel reason required.");
        await using var tx = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(ct) : null;
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
        if (course.Status == ClassStatus.Cancelled) { if (tx is not null) await tx.CommitAsync(ct); return; }
        if (sportDeactivated && course.Status == ClassStatus.Completed) return;
        var current = await PreviewCoreAsync(classId, sportDeactivated, ct);
        if (!sportDeactivated && !current.RefundsImmediately)
            await ClassCancellationRules.EnsureNoConfirmedEnrollmentsAsync(db, classId, ct);
        if (!sportDeactivated && !current.CanCancel)
            throw new ConflictException("class_not_cancellable", "Class not cancellable.");
        var currentHolds = await db.Set<SeatHold>().AsNoTracking().Where(x => x.ClassId == classId && x.Status == SeatHoldStatus.Active).ToListAsync(ct);
        var currentResponses = await db.Set<ThresholdResponse>().AsNoTracking().Where(x => x.ClassId == classId
            && (x.ResolutionStatus == ThresholdResolutionStatus.Pending || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)).ToListAsync(ct);
        if (current.Members.Any(x => !items.Contains(x.InvoiceItemId))
            || currentHolds.Any(x => !holds.Any(h => h.HoldId == x.HoldId) || x.InvoiceId != null && !invoices.Contains(x.InvoiceId.Value))
            || currentResponses.Any(x => !responses.Any(r => r.ThresholdResponseId == x.ThresholdResponseId)
                || x.AdditionalInvoiceId != null && !invoices.Contains(x.AdditionalInvoiceId.Value)))
            throw new ConflictException("class_cancellation_changed", "Class cancellation changed.");
        if (!sportDeactivated && ((current.ConfirmedCount > 0 || current.ActiveHoldCount > 0) && request.PreviewToken != current.PreviewToken
            || request.PreviewToken != null && request.PreviewToken != current.PreviewToken))
            throw new ConflictException("class_cancellation_changed", "Class cancellation changed.");
        var decisions = request.Refunds ?? [];
        if (!sportDeactivated && (decisions.Count != current.Members.Count
            || decisions.Select(x => x.EnrollmentId).Distinct().Count() != decisions.Count
            || decisions.Any(x => !current.Members.Any(m => m.EnrollmentId == x.EnrollmentId))))
            throw new BadRequestException("class_refund_members_invalid", "Enter refund points for each enrolled member exactly once.");
        if (!sportDeactivated && decisions.Any(x => x.Points is null or < 0
            || x.Points > current.Members.Single(m => m.EnrollmentId == x.EnrollmentId).RefundPoints))
            throw new BadRequestException("class_refund_points_invalid", "Refund points must be a whole number from zero to the member's remaining paid value.");
        var approvedPoints = current.Members.ToDictionary(m => m.EnrollmentId,
            m => sportDeactivated ? m.RefundPoints : decisions.Single(x => x.EnrollmentId == m.EnrollmentId).Points!.Value);
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
            if (!sportDeactivated)
            {
                var enrollment = await db.Set<Enrollment>().SingleAsync(e => e.EnrollmentId == member.EnrollmentId, ct);
                enrollment.CenterCancellationRefundPoints = approvedPoints[member.EnrollmentId];
                enrollment.CenterCancellationPaidBalanceVnd = member.RemainingPaidValueVnd;
            }
            // The center only notifies here. The Member then picks points (credited automatically) or sends a
            // refund request for the Manager; with no choice within 2 days the points are credited automatically.
            await enrollments.CancelAsync(member.InvoiceItemId, EnrollmentEndReason.CancelledByCenter, ct);
            var message = $"Course {course.Name} was cancelled by the center. Reason: {request.Reason.Trim()}. "
                + (approvedPoints[member.EnrollmentId] > 0
                    ? $"The approved refund is {approvedPoints[member.EnrollmentId]} points. Choose points right away, or send a refund request for the Manager. If you do not choose within 2 days, the points are credited automatically."
                    : "The Manager approved a refund of 0 points.");
            notifications.Queue(new(member.MemberId, NotificationEvents.ClassCancelled, message, member.EnrollmentId));
            var recipient = await users.GetAsync(member.MemberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new(member.MemberId, recipient.Email, NotificationEvents.ClassCancelled,
                    member.EnrollmentId, "SportHub - Class cancelled, choose your refund", EmailContent.Paragraph(message)));
        }
        if (sportDeactivated)
        {
            var legacyMembers = await db.Set<Enrollment>().Where(x => x.ClassId == classId
                && x.Status == EnrollmentStatus.Confirmed && x.InvoiceItemId == null).ToListAsync(ct);
            foreach (var member in legacyMembers)
            {
                member.Status = EnrollmentStatus.CancelledByCenter;
                member.EndedAt = clock.UtcNow;
                notifications.Queue(new(member.MemberId, NotificationEvents.ClassCancelled,
                    $"Course {course.Name} was cancelled because its sport was deactivated.", member.EnrollmentId));
            }
            await db.SaveChangesAsync(ct);
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE classes SET confirmed_count = 0, reserved_count = 0 WHERE class_id = {classId}", ct);
        }
        if (course.CoachId is Guid coachId)
        {
            var eventId = Guid.NewGuid();
            var message = !sportDeactivated && ClassCancellationRules.IsBelowThresholdDecision(course, current.ConfirmedCount, clock.UtcNow)
                ? $"Course {course.Name} was cancelled by the Manager because it did not meet its enrollment threshold. Enrolled members were notified and can choose a points refund or send a refund request. Reason: {request.Reason.Trim()}"
                : $"Course {course.Name} was cancelled by the Manager. Reason: {request.Reason.Trim()}";
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
                current.SessionsNotProvided, current.RefundsImmediately, course.ThresholdResponseDeadlineUtc,
                ApprovedRefunds = approvedPoints }), Reason: request.Reason.Trim()));
        await db.SaveChangesAsync(ct); if (tx is not null) await tx.CommitAsync(ct);
    }
}
public sealed record CourseCancellationMember(Guid EnrollmentId, Guid MemberId, Guid InvoiceItemId, decimal RemainingPaidValueVnd,
    int RefundPoints, string MemberName);
public sealed record CourseCancellationPreview(bool CanCancel, int Version, int TotalSessions, int SessionsNotProvided,
    int ConfirmedCount, int ActiveHoldCount, int RefundPoints, string PreviewToken, IReadOnlyList<CourseCancellationMember> Members,
    bool RefundsImmediately = false, string? BlockedReason = null);

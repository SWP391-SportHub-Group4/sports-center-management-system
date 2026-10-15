using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.Abstractions.Identity;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

/// <summary>Finalizes a class once, using the current paid roster before any automatic refund.</summary>
public sealed class ThresholdResponseExpiryService(ISportHubDbContext db, IRefundCreditService refunds,
    ICheckoutLifecycleService checkouts,
    IClassEnrollmentFulfillment classes, IOccupancyService occupancy, INotificationWriter notifications,
    IUserAccessReader users, IClock clock)
{
    public async Task<int> ExpireAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var classIds = await db.Set<Class>().AsNoTracking().Where(x => x.Status == ClassStatus.Published
            && x.ThresholdResponseDeadlineUtc <= now
            && (db.Set<ThresholdResponse>().Any(r => r.ClassId == x.ClassId
                    && (r.ResolutionStatus == ThresholdResolutionStatus.Pending
                        || r.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment))
                || (x.ThresholdStatus == ThresholdStatus.AtRisk
                    && db.Set<Enrollment>().Count(e => e.ClassId == x.ClassId
                        && e.Status == EnrollmentStatus.Confirmed) < x.BreakEvenThreshold)))
            .OrderBy(x => x.ClassId).Select(x => x.ClassId)
            .Take(100).ToListAsync(ct);
        var processed = 0;
        foreach (var classId in classIds)
        {
            if (await CancelIfStillBelowAsync(classId, ct)) processed++;
        }
        return processed;
    }

    private async Task<bool> CancelIfStillBelowAsync(int classId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"threshold-class-expiry:{classId}"}, 0))", ct);
        var entity = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, ct);
        if (entity is not null) await db.Entry(entity).ReloadAsync(ct);
        if (entity is null || entity.Status != ClassStatus.Published
            || entity.ThresholdResponseDeadlineUtc is null || entity.ThresholdResponseDeadlineUtc > clock.UtcNow)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        var active = await db.Set<Enrollment>().Where(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed)
            .OrderBy(x => x.EnrollmentId).ToListAsync(ct);
        var pending = await db.Set<ThresholdResponse>()
            .Where(x => x.ClassId == classId && (x.ResolutionStatus == ThresholdResolutionStatus.Pending
                || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment))
            .OrderBy(x => x.ThresholdResponseId).ToListAsync(ct);
        // Release outstanding transfer checkouts before touching paid items or class seats.
        foreach (var response in pending.Where(x => x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment
            && x.AdditionalInvoiceId.HasValue))
            await checkouts.ReleaseForSystemAsync(response.AdditionalInvoiceId!.Value, "Expired", ct);
        if (entity.ThresholdStatus == ThresholdStatus.Met
            || entity.BreakEvenThreshold is null || active.Count >= entity.BreakEvenThreshold.Value)
        {
            if (entity.BreakEvenThreshold is not null && entity.ThresholdStatus != ThresholdStatus.WaivedByManager)
                entity.ThresholdStatus = ThresholdStatus.Met;
            foreach (var response in pending)
            {
                response.ResolutionStatus = response.Choice == ThresholdResponseChoice.Transfer
                    ? ThresholdResolutionStatus.Expired : ThresholdResolutionStatus.Completed;
                response.ResolvedAtUtc = clock.UtcNow;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return false;
        }
        if (entity.ThresholdStatus == ThresholdStatus.WaivedByManager)
        {
            foreach (var response in pending)
            {
                response.ResolutionStatus = response.Choice == ThresholdResponseChoice.Transfer
                    ? ThresholdResolutionStatus.Expired : ThresholdResolutionStatus.Completed;
                response.ResolvedAtUtc = clock.UtcNow;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return false;
        }

        foreach (var enrollment in active)
        {
            if (enrollment.InvoiceItemId is not Guid itemId) continue;
            var response = pending.SingleOrDefault(x => x.EnrollmentId == enrollment.EnrollmentId)
                ?? await db.Set<ThresholdResponse>().SingleOrDefaultAsync(x => x.EnrollmentId == enrollment.EnrollmentId, ct);
            var eventId = response?.ThresholdResponseId ?? Guid.NewGuid();
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "Points refunded after the course was canceled for missing its break-even threshold", eventId), ct);
            await classes.CancelAsync(itemId, EnrollmentEndReason.CancelledByCenter, ct);
            if (response is not null)
            {
                response.ResolutionStatus = ThresholdResolutionStatus.Expired;
                response.ResolvedAtUtc = clock.UtcNow;
            }
            notifications.Queue(new NotificationRequest(enrollment.MemberId, NotificationEvents.ClassCancelled,
                $"Course {entity.Name} was canceled because it did not meet the break-even threshold; points were returned to your wallet."));
            var recipient = await users.GetAsync(enrollment.MemberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(enrollment.MemberId, recipient.Email,
                    NotificationEvents.ClassCancelled, Guid.NewGuid(), "SportHub - Course cancelled",
                    $"<p>Course {System.Net.WebUtility.HtmlEncode(entity.Name)} was cancelled because it did not reach the minimum enrollment. Your points were returned to your wallet.</p>"));
        }
        foreach (var response in pending)
        {
            response.ResolutionStatus = ThresholdResolutionStatus.Expired;
            response.ResolvedAtUtc = clock.UtcNow;
        }

        // Cancellation has acquired the class row lock after the invoice/wallet locks.
        // Also lock an empty class, and recheck concurrent waivers or newly confirmed seats.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", ct);
        await db.Entry(entity).ReloadAsync(ct);
        if (entity.Status != ClassStatus.Published || entity.ThresholdStatus == ThresholdStatus.WaivedByManager
            || await db.Set<Enrollment>().AnyAsync(x => x.ClassId == classId && x.Status == EnrollmentStatus.Confirmed, ct))
        {
            await tx.RollbackAsync(ct);
            return false;
        }

        var sessions = await db.Set<ClassSession>().Where(x => x.ClassId == classId
            && x.Status == ClassSessionStatus.Scheduled).ToListAsync(ct);
        foreach (var session in sessions)
        {
            await occupancy.ReleaseAsync(OccupancySources.ClassSession, session.SessionId, ct);
            session.Status = ClassSessionStatus.Cancelled;
        }
        entity.Status = ClassStatus.Cancelled;
        entity.Version++;
        var staffIds = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role!.RoleName == UserRole.CenterManager)
            .Select(x => x.UserId).ToListAsync(ct);
        if (entity.CoachId is Guid coachId) staffIds.Add(coachId);
        foreach (var userId in staffIds.Distinct())
        {
            var recipient = await users.GetAsync(userId, ct);
            if (recipient is null || !recipient.IsActive) continue;
            var message = $"Course {entity.Name} was cancelled because it did not reach the minimum enrollment. Check the class schedule.";
            notifications.Queue(new NotificationRequest(userId, NotificationEvents.ClassCancelled, message));
            notifications.QueueEmail(new EmailNotificationRequest(userId, recipient.Email,
                NotificationEvents.ClassCancelled, Guid.NewGuid(), "SportHub - Course cancelled",
                "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}

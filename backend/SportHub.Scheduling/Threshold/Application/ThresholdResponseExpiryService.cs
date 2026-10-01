using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Payment;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

/// <summary>Expires unanswered choices, then cancels and compensates any class still below its threshold.</summary>
public sealed class ThresholdResponseExpiryService(ISportHubDbContext db, IRefundCreditService refunds,
    ICheckoutLifecycleService checkouts,
    IClassEnrollmentFulfillment classes, IOccupancyService occupancy, INotificationWriter notifications, IClock clock)
{
    public async Task<int> ExpireAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var classIds = await db.Set<Class>().AsNoTracking().Where(x => x.Status == ClassStatus.Published
            && x.ThresholdResponseDeadlineUtc <= now
            && (db.Set<ThresholdResponse>().Any(r => r.ClassId == x.ClassId
                    && (r.ResolutionStatus == ThresholdResolutionStatus.Pending
                        || r.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment))
                || (x.ThresholdStatus != ThresholdStatus.WaivedByManager
                    && db.Set<Enrollment>().Count(e => e.ClassId == x.ClassId
                        && e.Status == EnrollmentStatus.Confirmed) < x.BreakEvenThreshold)))
            .OrderBy(x => x.ClassId).Select(x => x.ClassId)
            .Take(100).ToListAsync(ct);
        var processed = 0;
        foreach (var classId in classIds)
        {
            var responseIds = await db.Set<ThresholdResponse>().AsNoTracking()
                .Where(x => x.ClassId == classId && (x.ResolutionStatus == ThresholdResolutionStatus.Pending
                    || x.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment)
                    && x.DeadlineUtc <= now).OrderBy(x => x.ThresholdResponseId)
                .Select(x => x.ThresholdResponseId).ToListAsync(ct);
            foreach (var responseId in responseIds)
                if (await ExpireOneAsync(responseId, ct)) processed++;
            if (await CancelIfStillBelowAsync(classId, ct)) processed++;
        }
        return processed;
    }

    private async Task<bool> ExpireOneAsync(Guid responseId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize expiry workers without taking class locks ahead of invoice/wallet locks.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"threshold-expiry:{responseId}"}, 0))", ct);
        var candidate = await db.Set<ThresholdResponse>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.ThresholdResponseId == responseId, ct);
        if (candidate is null || candidate.ResolutionStatus is not
            (ThresholdResolutionStatus.Pending or ThresholdResolutionStatus.AwaitingPayment)
            || candidate.DeadlineUtc > clock.UtcNow)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        // Invoice lock precedes response/enrollment/class locks, matching payment fulfillment and manager refunds.
        if (candidate.ResolutionStatus == ThresholdResolutionStatus.AwaitingPayment
            && candidate.AdditionalInvoiceId is Guid additionalInvoiceId)
            await checkouts.ReleaseForSystemAsync(additionalInvoiceId, "Expired", ct);
        var rows = await db.Set<ThresholdResponse>().FromSqlInterpolated($"""
            SELECT * FROM class_threshold_responses WHERE threshold_response_id = {responseId} FOR UPDATE
            """).ToListAsync(ct);
        var response = rows.SingleOrDefault();
        if (response is null || response.ResolutionStatus is not (ThresholdResolutionStatus.Pending or ThresholdResolutionStatus.AwaitingPayment)
            || response.DeadlineUtc > clock.UtcNow)
        {
            await tx.RollbackAsync(ct);
            return false;
        }
        var enrollment = await db.Set<Enrollment>().SingleOrDefaultAsync(x => x.EnrollmentId == response.EnrollmentId
            && x.Status == EnrollmentStatus.Confirmed, ct);
        if (enrollment?.InvoiceItemId is Guid itemId)
        {
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "Tự hoàn điểm do hết hạn phản hồi ngưỡng hoàn vốn", response.ThresholdResponseId), ct);
            await classes.CancelAsync(itemId, EnrollmentEndReason.Refunded, ct);
        }
        response.ResolutionStatus = ThresholdResolutionStatus.Expired;
        response.ResolvedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
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
        if (entity.BreakEvenThreshold is null || active.Count >= entity.BreakEvenThreshold.Value)
        {
            if (entity.BreakEvenThreshold is not null && entity.ThresholdStatus != ThresholdStatus.WaivedByManager)
                entity.ThresholdStatus = ThresholdStatus.Met;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return false;
        }
        if (entity.ThresholdStatus == ThresholdStatus.WaivedByManager)
        {
            await tx.CommitAsync(ct);
            return false;
        }

        foreach (var enrollment in active)
        {
            if (enrollment.InvoiceItemId is not Guid itemId) continue;
            var response = await db.Set<ThresholdResponse>().SingleOrDefaultAsync(x => x.EnrollmentId == enrollment.EnrollmentId, ct);
            var eventId = response?.ThresholdResponseId ?? Guid.NewGuid();
            await refunds.CreditAsync(new RefundCreditRequest(itemId, 100,
                "Hoàn điểm khi khóa bị hủy do không đạt ngưỡng hoàn vốn", eventId), ct);
            await classes.CancelAsync(itemId, EnrollmentEndReason.CancelledByCenter, ct);
            if (response is not null)
            {
                response.ResolutionStatus = ThresholdResolutionStatus.Expired;
                response.ResolvedAtUtc = clock.UtcNow;
            }
            notifications.Queue(new NotificationRequest(enrollment.MemberId, NotificationEvents.ClassCancelled,
                $"Khóa {entity.Name} đã hủy do không đạt ngưỡng hoàn vốn; điểm đã được hoàn vào ví."));
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
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}

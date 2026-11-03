using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;
using SportHub.Scheduling.Domain.Rules;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Threshold.Application;

/// <summary>Evaluates published classes and queues one expiring, member-bound decision link per paid enrollment.</summary>
public sealed class ClassThresholdService(ISportHubDbContext db,
    SportHub.BuildingBlocks.Abstractions.Identity.IUserAccessReader users,
    INotificationWriter notifications, IAuditWriter audit, IClock clock, IConfiguration configuration) : IClassThresholdService
{
    public async Task ConfirmIfMetAsync(int classId, CancellationToken cancellationToken = default)
    {
        // Called inside paid-enrollment fulfillment's transaction. Its class UPDATE already owns the row lock.
        var entity = await db.Set<Class>().SingleAsync(x => x.ClassId == classId, cancellationToken);
        if (entity.Status != ClassStatus.Published || entity.ThresholdStatus != ThresholdStatus.AtRisk
            || entity.BreakEvenThreshold is not int minimum) return;
        var count = await db.Set<Enrollment>().CountAsync(x => x.ClassId == classId
            && x.Status == EnrollmentStatus.Confirmed, cancellationToken);
        if (count < minimum) return;
        entity.ThresholdStatus = ThresholdStatus.Met;
        entity.Version++;
        await NotifyConfirmedAsync(entity, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task WaiveAsync(int classId, Guid managerUserId, string reason, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("threshold_waiver_reason_required", "Threshold waiver reason required.");
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", cancellationToken);
        var entity = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, cancellationToken)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (entity.Status != ClassStatus.Published
            || entity.ThresholdStatus is ThresholdStatus.WaivedByManager or ThresholdStatus.Met)
            throw new ConflictException("class_threshold_not_waivable", "Class threshold not waivable.");
        var old = entity.ThresholdStatus;
        if (await db.Set<ClassSession>().AnyAsync(s => s.ClassId == classId
            && s.Status != ClassSessionStatus.Cancelled && s.StartAtUtc <= clock.UtcNow, cancellationToken))
            throw new ConflictException("threshold_opening_time_passed", "Move the unconfirmed opening to a future time or cancel the course before approving it to run.");
        entity.ThresholdStatus = ThresholdStatus.WaivedByManager;
        entity.Version++;
        audit.Write(new AuditEntry(managerUserId, "WAIVE_CLASS_THRESHOLD", nameof(Class), classId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { thresholdStatus = old.ToString() }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { thresholdStatus = ThresholdStatus.WaivedByManager.ToString() }),
            Reason: reason.Trim()));
        await NotifyConfirmedAsync(entity, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    public async Task UpdatePricingAsync(int classId, decimal price, decimal costAmount, Guid managerUserId,
        string reason, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("threshold_pricing_reason_required", "Threshold pricing reason required.");
        CourseRules.ValidatePrice(price);
        CourseRules.ValidateCost(costAmount);
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", cancellationToken);
        var entity = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, cancellationToken)
            ?? throw new NotFoundException("class_not_found", "Class not found.");
        if (entity.Status != ClassStatus.Published || entity.ThresholdDeadlineUtc is null
            || entity.ThresholdDeadlineUtc <= clock.UtcNow)
            throw new ConflictException("threshold_pricing_closed", "Threshold pricing closed.");
        var threshold = CourseRules.BreakEvenThreshold(costAmount, price);
        if (threshold > entity.Capacity)
            throw new BadRequestException("threshold_exceeds_capacity", "Threshold exceeds capacity.");
        var old = System.Text.Json.JsonSerializer.Serialize(new { entity.Price, entity.CostAmount, entity.BreakEvenThreshold });
        entity.Price = price;
        entity.CostAmount = costAmount;
        entity.BreakEvenThreshold = threshold;
        entity.Version++;
        audit.Write(new AuditEntry(managerUserId, "UPDATE_CLASS_THRESHOLD_PRICING", nameof(Class), classId.ToString(),
            OldValue: old,
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { price, costAmount, breakEvenThreshold = threshold }),
            Reason: reason.Trim()));
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    public async Task<int> EvaluateDueAsync(CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var ids = await db.Set<Class>().AsNoTracking()
            .Where(x => x.Status == ClassStatus.Published
                && (x.ThresholdDeadlineUtc <= now || x.Sessions.Any(s => s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc <= now))
                && x.ThresholdStatus != ThresholdStatus.WaivedByManager
                && (x.ThresholdStatus == ThresholdStatus.NotEvaluated || x.ThresholdStatus == ThresholdStatus.AtRisk))
            .OrderBy(x => x.ClassId).Select(x => x.ClassId).Take(100).ToListAsync(cancellationToken);
        var changed = 0;
        foreach (var id in ids)
        {
            await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT class_id FROM classes WHERE class_id = {id} FOR UPDATE", cancellationToken);
            var entity = await db.Set<Class>().SingleAsync(x => x.ClassId == id, cancellationToken);
            if (entity.Status != ClassStatus.Published
                || entity.ThresholdDeadlineUtc > clock.UtcNow
                    && !await db.Set<ClassSession>().AnyAsync(s => s.ClassId == id && s.Status == ClassSessionStatus.Scheduled && s.StartAtUtc <= clock.UtcNow, cancellationToken)
                || entity.ThresholdStatus == ThresholdStatus.WaivedByManager)
            {
                await tx.RollbackAsync(cancellationToken);
                continue;
            }

            var confirmed = await db.Set<Enrollment>().CountAsync(x => x.ClassId == id
                && x.Status == EnrollmentStatus.Confirmed, cancellationToken);
            if (entity.BreakEvenThreshold is null)
                throw new ConflictException("class_threshold_missing", "Class threshold missing.");

            if (confirmed >= entity.BreakEvenThreshold.Value)
            {
                if (entity.ThresholdStatus != ThresholdStatus.Met)
                {
                    entity.ThresholdStatus = ThresholdStatus.Met;
                    entity.Version++;
                    changed++;
                    await NotifyConfirmedAsync(entity, cancellationToken);
                }
            }
            else if (entity.ThresholdStatus == ThresholdStatus.NotEvaluated)
            {
                entity.ThresholdStatus = ThresholdStatus.AtRisk;
                entity.Version++;
                changed++;
                await NotifyStaffAsync(entity,
                    $"Course {entity.Name} has {confirmed}/{entity.BreakEvenThreshold} confirmed enrollments. Review the class and either waive the threshold, defer the start date, or cancel it. Cancellation immediately returns points to enrolled members and notifies the teaching Coach.",
                    NotificationEvents.ClassThresholdAtRisk, cancellationToken);
            }
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        return changed;
    }

    private async Task NotifyConfirmedAsync(Class entity, CancellationToken ct)
    {
        var active = await db.Set<Enrollment>().AsNoTracking()
            .Where(x => x.ClassId == entity.ClassId && x.Status == EnrollmentStatus.Confirmed)
            .Select(x => x.MemberId).Distinct().ToListAsync(ct);
        foreach (var memberId in active)
        {
            var recipient = await users.GetAsync(memberId, ct);
            if (recipient is null) continue;
            var message = $"Course {entity.Name} is confirmed to run. Your enrollment remains active. Check your class schedule for the first session.";
            notifications.Queue(new NotificationRequest(memberId, NotificationEvents.ClassThresholdConfirmed, message));
            notifications.QueueEmail(new EmailNotificationRequest(memberId, recipient.Email,
                NotificationEvents.ClassThresholdConfirmed, Guid.NewGuid(), "SportHub - Course confirmed",
                "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
        }
        if (entity.CoachId is Guid coachId)
        {
            var coach = await users.GetAsync(coachId, ct);
            if (coach is not null)
            {
                var message = $"Course {entity.Name} is confirmed to run with {active.Count} enrolled members. Review your teaching schedule.";
                notifications.Queue(new NotificationRequest(coachId, NotificationEvents.ClassThresholdConfirmed, message));
                notifications.QueueEmail(new EmailNotificationRequest(coachId, coach.Email,
                    NotificationEvents.ClassThresholdConfirmed, Guid.NewGuid(), "SportHub - Teaching schedule confirmed",
                    "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
            }
        }
        await NotifyStaffAsync(entity,
            $"Course {entity.Name} is confirmed to run{(entity.ThresholdStatus == ThresholdStatus.WaivedByManager ? " by Manager waiver" : " after meeting its enrollment threshold")}.",
            NotificationEvents.ClassThresholdConfirmed, ct, includeCoach: false);
    }

    private async Task NotifyStaffAsync(Class entity, string message, string eventType, CancellationToken ct,
        bool includeCoach = true)
    {
        var managerIds = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => x.Status == UserStatus.Active && x.Role!.RoleName == UserRole.CenterManager)
            .Select(x => x.UserId).ToListAsync(ct);
        if (includeCoach && entity.CoachId is Guid coachId) managerIds.Add(coachId);
        var sourceId = await db.Set<ClassSession>().Where(s => s.ClassId == entity.ClassId)
            .OrderBy(s => s.SessionNo).Select(s => (Guid?)s.SessionId).FirstOrDefaultAsync(ct);
        foreach (var userId in managerIds.Distinct())
        {
            var recipient = await users.GetAsync(userId, ct);
            if (recipient is null || !recipient.IsActive) continue;
            var path = userId == entity.CoachId
                ? $"/coach/classes/{entity.ClassId}" : $"/manager/classes/{entity.ClassId}?tab=threshold";
            var baseUrl = (configuration["Frontend:BaseUrl"] ?? configuration["Cors:AllowedOrigins:0"] ?? "http://localhost:3000").TrimEnd('/');
            notifications.Queue(new NotificationRequest(userId, eventType, message, sourceId));
            notifications.QueueEmail(new EmailNotificationRequest(userId, recipient.Email, eventType,
                Guid.NewGuid(), "SportHub - Course threshold update",
                "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p><p><a href=\""
                + System.Net.WebUtility.HtmlEncode(baseUrl + path) + "\">View class and opening conditions</a></p>"));
        }
    }

}

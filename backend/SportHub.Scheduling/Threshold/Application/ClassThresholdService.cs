using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
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
public sealed class ClassThresholdService(ISportHubDbContext db, ISystemSettingProvider settings,
    SportHub.BuildingBlocks.Abstractions.Identity.IUserAccessReader users,
    INotificationWriter notifications, IAuditWriter audit, IClock clock) : IClassThresholdService
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
            else if (entity.ThresholdStatus == ThresholdStatus.NotEvaluated
                || (entity.ThresholdStatus == ThresholdStatus.AtRisk && entity.ThresholdResponseDeadlineUtc is null))
            {
                var responseHours = await settings.GetIntAsync(SystemSettingKeys.ClassThresholdResponseHours, cancellationToken);
                if (responseHours is < 1 or > 48)
                    throw new ConflictException("class_threshold_response_setting_invalid", "Class threshold response setting invalid.");
                var firstStart = await db.Set<ClassSession>().Where(x => x.ClassId == id && x.Status == ClassSessionStatus.Scheduled)
                    .MinAsync(x => (DateTime?)x.StartAtUtc, cancellationToken);
                // Give members the full response period from the moment they are notified.
                // Publish schedules evaluation ten minutes early to absorb the five-minute job cadence.
                var plannedResponseDeadline = clock.UtcNow.AddHours(responseHours);
                var canOpenResponseWindow = firstStart is not null
                    && firstStart.Value.AddHours(-24) >= plannedResponseDeadline
                    && plannedResponseDeadline > clock.UtcNow;
                if (!canOpenResponseWindow && entity.ThresholdStatus == ThresholdStatus.NotEvaluated)
                {
                    entity.ThresholdStatus = ThresholdStatus.AtRisk;
                    entity.Version++;
                    changed++;
                    await NotifyStaffAsync(entity,
                        $"Course {entity.Name} is below its enrollment threshold, and a full {responseHours}-hour response window cannot end 24 hours before the first session. Decide now whether to waive the threshold, cancel the course, or move its start date. Members have not been offered a shortened response window.",
                        NotificationEvents.ClassThresholdAtRisk, cancellationToken);
                    await NotifyLateMembersAsync(entity, cancellationToken);
                }
                if (!canOpenResponseWindow)
                {
                    await db.SaveChangesAsync(cancellationToken);
                    await tx.CommitAsync(cancellationToken);
                    continue;
                }
                entity.ThresholdStatus = ThresholdStatus.AtRisk;
                entity.ThresholdResponseDeadlineUtc = plannedResponseDeadline;
                entity.Version++;
                changed++;
                await NotifyStaffAsync(entity,
                    $"Course {entity.Name} has {confirmed}/{entity.BreakEvenThreshold} confirmed enrollments. Review the class before {VietnamTime.ToLocal(entity.ThresholdResponseDeadlineUtc.Value):dd/MM/yyyy HH:mm} Vietnam time.",
                    NotificationEvents.ClassThresholdAtRisk, cancellationToken);
            }

            if (entity.ThresholdStatus == ThresholdStatus.AtRisk && entity.ThresholdResponseDeadlineUtc is DateTime deadline
                && deadline > clock.UtcNow)
            {
                await QueueMissingResponsesAsync(entity, deadline, cancellationToken);
            }
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        return changed;
    }

    private async Task NotifyLateMembersAsync(Class entity, CancellationToken ct)
    {
        var memberIds = await db.Set<Enrollment>().Where(e => e.ClassId == entity.ClassId
            && e.Status == EnrollmentStatus.Confirmed).Select(e => e.MemberId).Distinct().ToListAsync(ct);
        var eventId = Guid.NewGuid();
        var message = $"Course {entity.Name} has not been confirmed to run. There is not enough time for the member response window before opening. The Manager must confirm, defer or cancel the course; check your notifications and schedule for the decision. Your enrollment remains recorded.";
        foreach (var memberId in memberIds)
        {
            var recipient = await users.GetAsync(memberId, ct);
            if (recipient is null) continue;
            notifications.Queue(new(memberId, NotificationEvents.ClassThresholdAtRisk, message, eventId));
            notifications.QueueEmail(new(memberId, recipient.Email, NotificationEvents.ClassThresholdAtRisk,
                eventId, "SportHub - Course awaiting opening decision", "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
        }
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
        foreach (var userId in managerIds.Distinct())
        {
            var recipient = await users.GetAsync(userId, ct);
            if (recipient is null || !recipient.IsActive) continue;
            notifications.Queue(new NotificationRequest(userId, eventType, message));
            notifications.QueueEmail(new EmailNotificationRequest(userId, recipient.Email, eventType,
                Guid.NewGuid(), "SportHub - Course threshold update",
                "<p>" + System.Net.WebUtility.HtmlEncode(message) + "</p>"));
        }
    }

    private async Task QueueMissingResponsesAsync(Class entity, DateTime deadline, CancellationToken ct)
    {
        var active = await db.Set<Enrollment>().AsNoTracking().Where(x => x.ClassId == entity.ClassId
            && x.Status == EnrollmentStatus.Confirmed).Select(x => new { x.EnrollmentId, x.MemberId }).ToListAsync(ct);
        var existing = await db.Set<ThresholdResponse>().Where(x => x.ClassId == entity.ClassId)
            .Select(x => x.EnrollmentId).ToListAsync(ct);
        foreach (var enrollment in active.Where(x => !existing.Contains(x.EnrollmentId)))
        {
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .TrimEnd('=').Replace('+', '-').Replace('/', '_');
            var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            var responseId = Guid.NewGuid();
            db.Set<ThresholdResponse>().Add(new ThresholdResponse
            {
                ThresholdResponseId = responseId, ClassId = entity.ClassId,
                EnrollmentId = enrollment.EnrollmentId, MemberId = enrollment.MemberId,
                TokenHash = tokenHash, DeadlineUtc = deadline,
                ResolutionStatus = ThresholdResolutionStatus.Pending, CreatedAtUtc = clock.UtcNow
            });
            notifications.Queue(new NotificationRequest(enrollment.MemberId, NotificationEvents.ClassThresholdAtRisk,
                $"Course {entity.Name} has not met its enrollment threshold. Choose to keep your place, receive a points refund, or transfer before "
                + $"{VietnamTime.ToLocal(deadline):dd/MM/yyyy HH:mm} Vietnam time. Response link: /class-threshold-response?token={token}",
                responseId));
            var recipient = await users.GetAsync(enrollment.MemberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(enrollment.MemberId, recipient.Email,
                    NotificationEvents.ClassThresholdAtRisk, responseId, "SportHub - Course threshold not met",
                    "<p>Course " + System.Net.WebUtility.HtmlEncode(entity.Name)
                    + $" has not met its threshold. Choose to keep your place, receive a points refund, or transfer before {VietnamTime.ToLocal(deadline):dd/MM/yyyy HH:mm} Vietnam time."
                    + " Open this link in SportHub: /class-threshold-response?token=" + token + "</p>"));
        }
    }
}

using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
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
    public async Task WaiveAsync(int classId, Guid managerUserId, string reason, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("threshold_waiver_reason_required", "Cần nhập lý do miễn ngưỡng (3–500 ký tự).");
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", cancellationToken);
        var entity = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, cancellationToken)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");
        if (entity.Status != ClassStatus.Published || entity.ThresholdStatus == ThresholdStatus.WaivedByManager)
            throw new ConflictException("class_threshold_not_waivable", "Chỉ khóa Published chưa được miễn ngưỡng mới xử lý được.");
        var old = entity.ThresholdStatus;
        entity.ThresholdStatus = ThresholdStatus.WaivedByManager;
        entity.Version++;
        audit.Write(new AuditEntry(managerUserId, "WAIVE_CLASS_THRESHOLD", nameof(Class), classId.ToString(),
            OldValue: System.Text.Json.JsonSerializer.Serialize(new { thresholdStatus = old.ToString() }),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new { thresholdStatus = ThresholdStatus.WaivedByManager.ToString() }),
            Reason: reason.Trim()));
        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    public async Task UpdatePricingAsync(int classId, decimal price, decimal costAmount, Guid managerUserId,
        string reason, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length is < 3 or > 500)
            throw new BadRequestException("threshold_pricing_reason_required", "Cần nhập lý do đổi giá/chi phí.");
        CourseRules.ValidatePrice(price);
        CourseRules.ValidateCost(costAmount);
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT class_id FROM classes WHERE class_id = {classId} FOR UPDATE", cancellationToken);
        var entity = await db.Set<Class>().SingleOrDefaultAsync(x => x.ClassId == classId, cancellationToken)
            ?? throw new NotFoundException("class_not_found", "Không tìm thấy khóa học.");
        if (entity.Status != ClassStatus.Published || entity.ThresholdDeadlineUtc is null
            || entity.ThresholdDeadlineUtc <= clock.UtcNow)
            throw new ConflictException("threshold_pricing_closed", "Chỉ sửa giá/chi phí lớp Published trước hạn đánh giá ngưỡng.");
        var threshold = CourseRules.BreakEvenThreshold(costAmount, price);
        if (threshold > entity.Capacity)
            throw new BadRequestException("threshold_exceeds_capacity", "Ngưỡng hoàn vốn lớn hơn sức chứa khóa.");
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
            .Where(x => x.Status == ClassStatus.Published && x.ThresholdDeadlineUtc <= now
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
            if (entity.Status != ClassStatus.Published || entity.ThresholdDeadlineUtc > clock.UtcNow
                || entity.ThresholdStatus == ThresholdStatus.WaivedByManager)
            {
                await tx.RollbackAsync(cancellationToken);
                continue;
            }

            var confirmed = await db.Set<Enrollment>().CountAsync(x => x.ClassId == id
                && x.Status == EnrollmentStatus.Confirmed, cancellationToken);
            if (entity.BreakEvenThreshold is null)
                throw new ConflictException("class_threshold_missing", "Khóa đã publish nhưng thiếu snapshot ngưỡng.");

            if (confirmed >= entity.BreakEvenThreshold.Value)
            {
                if (entity.ThresholdStatus != ThresholdStatus.Met)
                {
                    entity.ThresholdStatus = ThresholdStatus.Met;
                    entity.Version++;
                    changed++;
                }
            }
            else if (entity.ThresholdStatus == ThresholdStatus.NotEvaluated)
            {
                var responseHours = await settings.GetIntAsync(SystemSettingKeys.ClassThresholdResponseHours, cancellationToken);
                if (responseHours is < 1 or > 336)
                    throw new ConflictException("class_threshold_response_setting_invalid", "Thời hạn phản hồi phải từ 1 đến 336 giờ.");
                entity.ThresholdStatus = ThresholdStatus.AtRisk;
                entity.ThresholdResponseDeadlineUtc = clock.UtcNow.AddHours(responseHours);
                entity.Version++;
                changed++;
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
                $"Khóa {entity.Name} chưa đạt ngưỡng đăng ký. Hãy chọn hoàn điểm hoặc chuyển lớp trước "
                + $"{VietnamTime.ToLocal(deadline):dd/MM/yyyy HH:mm}. Liên kết phản hồi: /class-threshold-response?token={token}",
                responseId));
            var recipient = await users.GetAsync(enrollment.MemberId, ct);
            if (recipient is not null)
                notifications.QueueEmail(new EmailNotificationRequest(enrollment.MemberId, recipient.Email,
                    NotificationEvents.ClassThresholdAtRisk, responseId, "SportHub - Khóa học chưa đạt ngưỡng",
                    "<p>Khóa " + System.Net.WebUtility.HtmlEncode(entity.Name)
                    + $" chưa đạt ngưỡng. Chọn hoàn điểm hoặc chuyển lớp trước {VietnamTime.ToLocal(deadline):dd/MM/yyyy HH:mm}."
                    + " Mở liên kết sau trên ứng dụng SportHub: /class-threshold-response?token=" + token + "</p>"));
        }
    }
}

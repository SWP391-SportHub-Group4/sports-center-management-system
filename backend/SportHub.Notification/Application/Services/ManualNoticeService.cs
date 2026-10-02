using System.Text.Encodings.Web;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Notifications;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Notification.Application.DTOs;
using SportHub.Notification.Domain.Enums;

namespace SportHub.Notification.Application.Services;

public sealed class ManualNoticeService(ISportHubDbContext db, INotificationWriter notifications, IAuditWriter audit,
    IAuditReader receipts, INotificationDeliveryReader delivery)
{
    public async Task<Guid> SendAsync(ManualNoticeRequest request, Guid managerId, CancellationToken ct = default,
        string? idempotencyKey = null)
    {
        var noticeId = idempotencyKey is null ? Guid.NewGuid() : IdForKey(managerId, idempotencyKey);
        var recipients = request.RecipientUserIds.Distinct().Order().ToList();
        var safeSubject = request.Subject.Trim();
        var safeMessage = request.Message.Trim();
        if (recipients.Count is < 1 or > 200 || (!request.SendInApp && !request.SendEmail))
            throw new BadRequestException("invalid_manual_notice", "Cần 1–200 người nhận và chọn ít nhất một kênh.");
        if (safeSubject.Length is < 3 or > 150 || safeMessage.Length is < 3 or > 3000)
            throw new BadRequestException("invalid_manual_notice", "Tiêu đề hoặc nội dung có độ dài không hợp lệ.");
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            { recipients, safeSubject, safeMessage, request.SendInApp, request.SendEmail }))));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"manual-notice:{noticeId}"}, 0))", ct);
        var previous = await receipts.FindNewValueAsync(managerId, "SEND_MANUAL_NOTICE", "Notification", noticeId.ToString(), ct);
        if (previous is not null)
        {
            using var receipt = JsonDocument.Parse(previous);
            if (!receipt.RootElement.TryGetProperty("requestFingerprint", out var saved) || saved.GetString() != fingerprint)
                throw new ConflictException("notice_idempotency_conflict", "Mã yêu cầu đã dùng cho nội dung khác.");
            await tx.CommitAsync(ct);
            return noticeId;
        }
        var users = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => recipients.Contains(x.UserId) && x.Status == UserStatus.Active)
            .Select(x => new { x.UserId, x.Email }).ToListAsync(ct);
        if (users.Count != recipients.Count)
            throw new BadRequestException("manual_notice_recipient_invalid", "Có người nhận không tồn tại hoặc tài khoản không hoạt động.");

        var body = "<h2>" + HtmlEncoder.Default.Encode(safeSubject) + "</h2><p>"
            + HtmlEncoder.Default.Encode(safeMessage).Replace("\r\n", "\n").Replace("\n", "<br>") + "</p>";
        foreach (var user in users)
        {
            if (request.SendInApp)
                notifications.Queue(new NotificationRequest(user.UserId, NotificationEvents.ManualNotice,
                    safeMessage, noticeId));
            if (request.SendEmail)
                notifications.QueueEmail(new EmailNotificationRequest(user.UserId, user.Email,
                    NotificationEvents.ManualNotice, noticeId, safeSubject, body));
        }
        audit.Write(new AuditEntry(managerId, "SEND_MANUAL_NOTICE", "Notification", noticeId.ToString(),
            NewValue: System.Text.Json.JsonSerializer.Serialize(new
            {
                recipientCount = users.Count, request.SendInApp, request.SendEmail, subject = safeSubject, requestFingerprint = fingerprint
            })));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return noticeId;
    }

    public async Task<ManualNoticeReceipt> GetAsync(Guid noticeId, Guid managerId, CancellationToken ct = default)
    {
        if (await receipts.FindNewValueAsync(managerId, "SEND_MANUAL_NOTICE", "Notification", noticeId.ToString(), ct) is null)
            throw new NotFoundException("notice_not_found", "Không tìm thấy thông báo của tài khoản này.");
        return new(noticeId, await delivery.GetAsync(NotificationEvents.ManualNotice, noticeId, ct));
    }

    public async Task<ManualNoticeReceipt> GetByKeyAsync(string key, Guid managerId, CancellationToken ct = default)
    {
        var id = IdForKey(managerId, key);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({$"manual-notice:{id}"}, 0))", ct);
        var receipt = await GetAsync(id, managerId, ct);
        await tx.CommitAsync(ct);
        return receipt;
    }

    private static Guid IdForKey(Guid managerId, string key)
    {
        if (!Guid.TryParse(key, out var parsed) || parsed == Guid.Empty)
            throw new BadRequestException("invalid_idempotency_key", "Idempotency-Key phải là UUID hợp lệ.");
        return new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"manual-notice:{managerId:D}:{parsed:D}")).AsSpan(0, 16));
    }
}
public sealed record ManualNoticeReceipt(Guid NoticeId, NotificationDelivery Delivery);

using System.Text.Encodings.Web;
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

public sealed class ManualNoticeService(ISportHubDbContext db, INotificationWriter notifications, IAuditWriter audit)
{
    public async Task<Guid> SendAsync(ManualNoticeRequest request, Guid managerId, CancellationToken ct = default)
    {
        var recipients = request.RecipientUserIds.Distinct().ToList();
        if (recipients.Count is < 1 or > 200 || (!request.SendInApp && !request.SendEmail))
            throw new BadRequestException("invalid_manual_notice", "Cần 1–200 người nhận và chọn ít nhất một kênh.");
        var users = await db.Set<UserAccount>().AsNoTracking()
            .Where(x => recipients.Contains(x.UserId) && x.Status == UserStatus.Active)
            .Select(x => new { x.UserId, x.Email }).ToListAsync(ct);
        if (users.Count != recipients.Count)
            throw new BadRequestException("manual_notice_recipient_invalid", "Có người nhận không tồn tại hoặc tài khoản không hoạt động.");

        var noticeId = Guid.NewGuid();
        var safeSubject = request.Subject.Trim();
        var safeMessage = request.Message.Trim();
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
                recipientCount = users.Count, request.SendInApp, request.SendEmail, subject = safeSubject
            })));
        await db.SaveChangesAsync(ct);
        return noticeId;
    }
}

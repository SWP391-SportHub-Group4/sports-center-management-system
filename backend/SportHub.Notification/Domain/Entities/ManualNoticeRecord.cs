namespace SportHub.Notification.Domain.Entities;

/// <summary>Immutable send-time receipt, independent of delivery attempts and later profile changes.</summary>
public sealed class ManualNoticeRecord
{
    public Guid NoticeId { get; set; }
    public Guid ManagerId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string? Message { get; set; }
    public bool SendInApp { get; set; }
    public bool SendEmail { get; set; }
    public int RecipientCount { get; set; }
    public string RecipientsJson { get; set; } = "[]";
    public bool IsLegacy { get; set; }
}

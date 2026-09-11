namespace SportHub.Repository.Entities;

public class AuditLog
{
    public Guid AuditId { get; set; } // PK

    public Guid UserId { get; set; } // FK -> UserAccount, ai thực hiện thao tác

    public UserAccount? User { get; set; }

    public string Action { get; set; } = string.Empty; // vd "UPDATE_PACKAGE_STATUS" — chuỗi tự do

    public string TargetEntity { get; set; } = string.Empty;

    public Guid TargetId { get; set; }

    public string? OldValue { get; set; } // jsonb

    public string? NewValue { get; set; } // jsonb

    public string IpAddress { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }
}

using SportHub.Identity.Domain.Entities;

namespace SportHub.Audit.Domain.Entities;

public class AuditLog
{
    public Guid AuditId { get; set; } // PK

    public Guid UserId { get; set; } // FK -> UserAccount, ai thực hiện thao tác

    public UserAccount? User { get; set; }

    public string Action { get; set; } = string.Empty; // vd "UPDATE_PACKAGE_STATUS" — chuỗi tự do

    public string TargetEntity { get; set; } = string.Empty;

    // Chuỗi chứ không phải Guid: BR-7 yêu cầu ghi log cả thao tác trên Room/Class/
    // MembershipPackage — những entity có PK kiểu int (SSOT §2). Guid không biểu diễn được
    // các khoá đó nên audit cho chúng sẽ không ghi được. Type của field này chưa từng được
    // chốt trong SSOT/entity-field-purpose (xem implementation-decisions.md A6).
    public string TargetId { get; set; } = string.Empty;

    public string? OldValue { get; set; } // jsonb

    public string? NewValue { get; set; } // jsonb

    public string IpAddress { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }
}

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt).
// Module sở hữu CHƯA gán chính thức — cùng tình trạng với Notification, xem SSOT
// §7 Open Questions. Nhật ký thao tác quan trọng trên hệ thống (yêu cầu của
// Center Manager: "xem lịch sử thao tác quan trọng") — ai đổi gì, từ giá trị nào
// sang giá trị nào.
public class AuditLog
{
    public Guid audit_id { get; set; }

    public Guid user_id { get; set; }

    public UserAccount? User { get; set; }

    // Loại hành động (vd "UPDATE_PACKAGE_STATUS") — chuỗi tự do, KHÔNG phải enum kín.
    public string action { get; set; } = string.Empty;

    public string target_entity { get; set; } = string.Empty;

    public Guid target_id { get; set; }

    // jsonb, nullable — giá trị trước/sau, truy vết thay đổi thực tế.
    public string? old_value { get; set; }

    public string? new_value { get; set; }

    // Nguồn thực hiện — phục vụ điều tra bảo mật nếu cần.
    public string ip_address { get; set; } = string.Empty;

    public DateTime timestamp { get; set; }
}

using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt).
// Module sở hữu CHƯA gán chính thức (không thuộc 6 module hiện có ở backend —
// Identity/Membership/Scheduling/Payment/Training/AI) — xem SSOT §7 Open
// Questions. Tạm đặt ở thư mục Entities/Shared, không tạo Module/ riêng cho tới
// khi nhóm chốt. MVP: lưu trong DB, không gửi SMS/email thật (SSOT §1.3).
public class Notification
{
    public Guid notification_id { get; set; }

    public Guid user_id { get; set; }

    public UserAccount? User { get; set; }

    // IN_APP/EMAIL/SMS — MVP: chỉ InApp thật sự hoạt động.
    public NotificationChannel channel { get; set; }

    // Loại sự kiện sinh ra thông báo này.
    public NotificationSourceEventType source_event_type { get; set; }

    // Nullable — trỏ tới entity gây ra sự kiện (vd session_id nếu là CLASS_CANCELLED).
    public Guid? source_entity_id { get; set; }

    public string message { get; set; } = string.Empty;

    // PENDING/SENT/FAILED/READ — vòng đời gửi + đã đọc chưa.
    public NotificationStatus status { get; set; }

    // Số lần đã thử gửi lại (khi FAILED).
    public int retry_count { get; set; }

    public DateTime? last_attempt_at { get; set; }

    public DateTime? sent_at { get; set; }
}

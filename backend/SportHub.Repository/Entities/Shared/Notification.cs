using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt).
// Module sở hữu CHƯA gán chính thức (không thuộc 6 module hiện có ở backend —
// Identity/Membership/Scheduling/Payment/Training/AI) — xem SSOT §7 Open
// Questions. Tạm đặt ở thư mục Entities/Shared, không tạo Module/ riêng cho tới
// khi nhóm chốt. MVP: lưu trong DB, không gửi SMS/email thật (SSOT §1.3).
public class Notification
{
    public Guid NotificationId { get; set; }

    public Guid UserId { get; set; }

    public UserAccount? User { get; set; }

    // IN_APP/EMAIL/SMS — MVP: chỉ InApp thật sự hoạt động.
    public NotificationChannel Channel { get; set; }

    // Loại sự kiện sinh ra thông báo này.
    public NotificationSourceEventType SourceEventType { get; set; }

    // Nullable — trỏ tới entity gây ra sự kiện (vd session_id nếu là CLASS_CANCELLED).
    public Guid? SourceEntityId { get; set; }

    public string Message { get; set; } = string.Empty;

    // PENDING/SENT/FAILED/READ — vòng đời gửi + đã đọc chưa.
    public NotificationStatus Status { get; set; }

    // Số lần đã thử gửi lại (khi FAILED).
    public int RetryCount { get; set; }

    public DateTime? LastAttemptAt { get; set; }

    public DateTime? SentAt { get; set; }
}

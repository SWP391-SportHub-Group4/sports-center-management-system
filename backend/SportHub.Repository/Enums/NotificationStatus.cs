namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd NotificationStatus.Pending <-> "PENDING") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trạng thái gửi/đọc của 1 thông báo.
/// Dùng ở: Notification.Status.
/// </summary>
public enum NotificationStatus
{
    Pending,
    Sent,
    Failed,
    Read
}

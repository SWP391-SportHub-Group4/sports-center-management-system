namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd NotificationChannel.InApp <-> "IN_APP") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Kênh gửi thông báo. MVP: chỉ InApp thật sự hoạt động, Email/Sms chỉ lưu log (SSOT §1.3).
/// Dùng ở: Notification.Channel.
/// </summary>
public enum NotificationChannel
{
    InApp,
    Email,
    Sms
}

namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd NotificationSourceEventType.ClassCancelled <-> "CLASS_CANCELLED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Sự kiện nguồn phát sinh thông báo.
/// Dùng ở: Notification.source_event_type.
/// </summary>
public enum NotificationSourceEventType
{
    ClassCancelled,
    ScheduleChanged,
    PackageExpiring,
    PaymentReceived
}

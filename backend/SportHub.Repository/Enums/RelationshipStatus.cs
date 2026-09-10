namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd RelationshipStatus.Active <-> "ACTIVE") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trạng thái quan hệ Coach–Member. Chỉ 1 quan hệ Active giữa 1 cặp Coach–Member tại 1 thời điểm (ràng buộc #7).
/// Dùng ở: CoachMemberRelationship.status.
/// </summary>
public enum RelationshipStatus
{
    Active,
    Ended
}

namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd RelationshipSourceType.ClassBased <-> "CLASS_BASED") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Nguồn gốc quan hệ Coach–Member — dùng để audit/giải trình quyền truy cập.
/// Dùng ở: CoachMemberRelationship.source_type.
/// </summary>
public enum RelationshipSourceType
{
    ClassBased,
    Personal,
    AssignedByManager
}

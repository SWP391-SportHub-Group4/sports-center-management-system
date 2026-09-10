namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd ExperienceLevel.Beginner <-> "BEGINNER") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Trình độ tập luyện của Member — input cho AI suggestion (BR-26) và Coach điều chỉnh độ khó.
/// Dùng ở: MemberTrainingProfile.experience_level.
/// </summary>
public enum ExperienceLevel
{
    Beginner,
    Intermediate,
    Advanced
}

using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Membership.
// Hồ sơ tập luyện của Member — BẮT BUỘC phải có dữ liệu thật để AI gợi ý bài tập
// (BR-26 yêu cầu đủ 3 tham số: goal, level, lịch sử) thay vì để client tự gửi
// tham số (dễ bị giả mạo/không chính xác). Chi tiết field: docs/entity-field-purpose.md § MEMBER_TRAINING_PROFILE.
public class MemberTrainingProfile
{
    public Guid ProfileID { get; set; }

    // Unique — 1 Member chỉ có 1 hồ sơ (ràng buộc 1–1).
    public Guid MemberID { get; set; }

    public User? Member { get; set; }

    public string Goal { get; set; } = string.Empty;

    public ExperienceLevel ExperienceLevel { get; set; }

    // Ghi chú tự do (chấn thương, hạn chế...) — Coach tham khảo khi lên plan.
    public string? Notes { get; set; }

    // Biết hồ sơ có đang cũ/stale không (AI dựa vào profile cũ có thể gợi ý sai).
    public DateTime UpdatedAt { get; set; }
}

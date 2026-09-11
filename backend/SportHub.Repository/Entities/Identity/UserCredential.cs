namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Mới 10/09/2026 (2) — Google Login: tách khỏi UserAccount vì đây là dữ liệu nhạy
// cảm, cô lập khỏi các query hiển thị/business thông thường (tránh vô tình SELECT/
// trả về password_hash trong response). Quan hệ 1–1 với UserAccount (dùng chung PK).
public class UserCredential
{
    // PK, đồng thời là FK → UserAccount (quan hệ 1–1, dùng chung giá trị user_id).
    public Guid UserId { get; set; }

    public UserAccount? UserAccount { get; set; }

    // Nullable: account tạo thuần qua Google (chưa từng đặt password nội bộ) để trống.
    // POST /api/auth/login chỉ cho phép khi field này khác null.
    public string? PasswordHash { get; set; }
}

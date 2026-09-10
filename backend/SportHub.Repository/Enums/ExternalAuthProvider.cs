namespace SportHub.Repository.Enums;

// Nguồn DUY NHẤT của enum này: docs/00-Source-of-Truth.md §3 ("Enum đã chốt").
// Mới 10/09/2026 (2), phục vụ UserExternalLogin (Google Login, nay là flow bắt buộc).
// KHÔNG định nghĩa lại giá trị enum ở nơi khác. Chuỗi lưu DB / trả API dùng UPPER_SNAKE_CASE
// (vd ExternalAuthProvider.Google <-> "GOOGLE") — cơ chế serialize cụ thể chưa chốt, xem SSOT §7 Open Questions.
/// <summary>
/// Provider đăng nhập ngoài — hiện chỉ Google, mở rộng provider khác không cần đổi entity.
/// Dùng ở: UserExternalLogin.provider.
/// </summary>
public enum ExternalAuthProvider
{
    Google
}

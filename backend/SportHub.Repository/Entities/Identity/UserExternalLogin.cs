using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Identity.
// Mới 10/09/2026 (2) — Google Login: đăng nhập qua provider ngoài — quan hệ 1-N
// THẬT với UserAccount (khác UserCredential/UserProfile là 1-1), vì 1 user có thể
// gắn nhiều provider theo thời gian.
public class UserExternalLogin
{
    public Guid ExternalLoginId { get; set; }

    public Guid UserId { get; set; }

    public UserAccount? UserAccount { get; set; }

    // GOOGLE — hiện chỉ Google, mở rộng provider khác không cần đổi entity.
    public ExternalAuthProvider Provider { get; set; }

    // ID phía provider trả về (Google `sub`) — cùng `provider` tạo unique composite
    // (ràng buộc #15) — chặn 1 tài khoản Google bị link vào 2 UserAccount khác nhau.
    public string ProviderUserId { get; set; } = string.Empty;

    // Nullable, MVP CHƯA mã hoá — nợ kỹ thuật, xem SSOT §7 Open Questions.
    // Không lưu access token vì sống ngắn hạn, không cần persist.
    public string? RefreshToken { get; set; }

    // Mốc link provider — cũng là mốc dùng cho ràng buộc #16 (user_id, provider unique).
    public DateTime CreatedAt { get; set; }
}

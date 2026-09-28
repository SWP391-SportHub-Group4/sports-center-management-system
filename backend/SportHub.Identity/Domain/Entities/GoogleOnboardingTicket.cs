namespace SportHub.Identity.Domain.Entities;

/// <summary>
/// Phiếu onboarding một lần cho Google user mới — chưa tạo UserAccount cho tới khi hoàn tất
/// POST /api/auth/google/onboarding với mật khẩu do người dùng tự chọn.
/// </summary>
public class GoogleOnboardingTicket
{
    public Guid TicketId { get; set; }

    /// <summary>SHA-256 hex của opaque token — không lưu raw token.</summary>
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>Google subject (provider user id) đã verify qua id_token.</summary>
    public string ProviderUserId { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    /// <summary>Tên gợi ý từ Google — prefill, không phải giá trị cuối cùng bắt buộc.</summary>
    public string? SuggestedFullName { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime? ConsumedAt { get; set; }
}

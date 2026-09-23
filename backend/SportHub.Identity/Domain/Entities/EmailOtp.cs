namespace SportHub.Identity.Domain.Entities;

/// <summary>
/// BR-78 — mã OTP xác thực quyền sở hữu email trước khi Register bằng email/mật khẩu.
/// 1 dòng/email: yêu cầu mã mới GHI ĐÈ dòng cũ, không giữ lịch sử các lần gửi.
/// </summary>
public class EmailOtp
{
    public Guid EmailOtpId { get; set; }

    public string Email { get; set; } = string.Empty;

    /// <summary>SHA-256 hex của mã 6 số — không lưu plaintext.</summary>
    public string CodeHash { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }

    /// <summary>Số lần nhập sai cho mã hiện tại; đủ ngưỡng thì phải yêu cầu mã mới.</summary>
    public int Attempts { get; set; }

    /// <summary>null = còn dùng được; set khi xác thực đúng để mã không dùng lại lần 2.</summary>
    public DateTime? ConsumedAt { get; set; }

    /// <summary>Thời điểm gửi mã gần nhất — mốc tính cooldown gửi lại.</summary>
    public DateTime CreatedAt { get; set; }
}

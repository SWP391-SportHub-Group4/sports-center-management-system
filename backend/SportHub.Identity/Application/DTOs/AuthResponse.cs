namespace SportHub.Identity.Application.DTOs;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public UserSummaryResponse User { get; set; } = null!;

    /// <summary>Register luôn true; Login luôn false; Google Login true chỉ khi vừa tạo tài khoản.</summary>
    public bool IsNewAccount { get; set; }

    /// <summary>
    /// Chỉ khác null khi Google Login vừa tạo tài khoản mới. KHÔNG lưu/hash vào UserCredential
    /// (BR-60) — FE chỉ đặt thật qua POST /api/users/me/password khi người dùng đồng ý.
    /// </summary>
    public string? SuggestedPassword { get; set; }
}

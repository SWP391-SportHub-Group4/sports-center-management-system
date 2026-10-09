namespace SportHub.Identity.Application.DTOs;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public UserSummaryResponse User { get; set; } = null!;

    /// <summary>Register luôn true; Login luôn false; Google true khi vừa tự tạo tài khoản mới.</summary>
    public bool IsNewAccount { get; set; }
}

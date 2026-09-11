using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class UserExternalLogin
{
    public Guid ExternalLoginId { get; set; } // PK

    public Guid UserId { get; set; } // FK -> UserAccount

    public UserAccount? UserAccount { get; set; }

    public ExternalAuthProvider Provider { get; set; } // hiện chỉ Google

    public string ProviderUserId { get; set; } = string.Empty; // ID phía provider (vd Google sub), unique cùng Provider

    public string? RefreshToken { get; set; } // nullable, MVP chưa mã hoá

    public DateTime CreatedAt { get; set; } // mốc link provider
}

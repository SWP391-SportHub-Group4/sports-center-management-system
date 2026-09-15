namespace SportHub.Identity.Application.DTOs;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public UserSummaryDto User { get; set; } = null!;
}

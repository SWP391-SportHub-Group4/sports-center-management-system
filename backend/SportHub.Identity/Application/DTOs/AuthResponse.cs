namespace SportHub.Identity.Application.DTOs;

public class AuthResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public UserSummaryResponse User { get; set; } = null!;
}

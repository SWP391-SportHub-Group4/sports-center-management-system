namespace SportHub.Identity.Application.DTOs;

public class UserSummaryResponse
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;

    // BR-96, mới 28/09/2026 — null khi role khác Coach.
    public string? CoachCategory { get; set; }
}

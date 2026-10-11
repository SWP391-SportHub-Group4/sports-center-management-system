namespace SportHub.Identity.Application.DTOs;

public class UserSummaryResponse
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    [SportHub.BuildingBlocks.Api.WireEnum] public string Role { get; set; } = string.Empty;


    /// <summary>Môn chuyên môn của Coach. Rỗng với role khác.</summary>
    public IReadOnlyList<int> SportIds { get; set; } = [];

    /// <summary>Coach có qualification dịch vụ PT đang bật (không suy ra từ chuyên môn môn Gym). False với role khác.</summary>
    public bool IsPersonalTrainer { get; set; }
}

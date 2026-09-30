namespace SportHub.Identity.Application.DTOs;

public class UserSummaryResponse
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;


    /// <summary>Chỉ có ý nghĩa với role ExternalCoach (PendingApproval/Approved/Rejected/Suspended); null với role khác.</summary>
    public string? ApprovalStatus { get; set; }

    /// <summary>Môn chuyên môn (Coach) / môn giảng dạy khai báo (ExternalCoach). Rỗng với role khác.</summary>
    public IReadOnlyList<int> SportIds { get; set; } = [];
}

namespace SportHub.Identity.Domain.Entities;

/// <summary>Hồ sơ ExternalCoach (BR-105): 1-1 với UserAccount role ExternalCoach; môn giảng dạy nằm ở UserSportSpecialty.</summary>
public class ExternalCoachProfile
{
    public Guid UserId { get; set; } // PK, đồng thời FK -> UserAccount

    public UserAccount? UserAccount { get; set; }

    public string? Bio { get; set; }

    public ExternalCoachApprovalStatus ApprovalStatus { get; set; }

    public Guid? ReviewedByUserId { get; set; }

    public DateTime? ReviewedAt { get; set; }

    /// <summary>Bắt buộc khi Rejected/Suspended (kiểm ở service).</summary>
    public string? ReviewNote { get; set; }

    public DateTime CreatedAt { get; set; }
}

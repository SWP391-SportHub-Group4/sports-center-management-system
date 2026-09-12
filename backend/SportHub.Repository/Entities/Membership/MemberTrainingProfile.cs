namespace SportHub.Repository.Entities.Membership;

public class MemberTrainingProfile
{
    public Guid ProfileId { get; set; } // PK

    public Guid MemberId { get; set; } // FK -> UserAccount, unique (1-1)

    public UserAccount? Member { get; set; }

    public string Goal { get; set; } = string.Empty; // input cho AI suggestion + Coach lập plan

    public ExperienceLevel ExperienceLevel { get; set; } // Beginner/Intermediate/Advanced

    public string? Notes { get; set; } // chấn thương, hạn chế...

    public DateTime UpdatedAt { get; set; } // biết hồ sơ có đang cũ/stale không
}

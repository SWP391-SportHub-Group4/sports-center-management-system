namespace SportHub.Repository.Entities;

public class UserProfile
{
    public Guid UserId { get; set; } // PK, đồng thời FK -> UserAccount (1-1)

    public UserAccount? UserAccount { get; set; }

    public string FullName { get; set; } = string.Empty;

    public string? Phone { get; set; } // unique nếu có giá trị, nullable
}

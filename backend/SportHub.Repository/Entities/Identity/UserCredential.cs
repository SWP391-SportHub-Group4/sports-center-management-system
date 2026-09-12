namespace SportHub.Repository.Entities.Identity;

public class UserCredential
{
    public Guid UserId { get; set; } // PK, đồng thời FK -> UserAccount (1-1)

    public UserAccount? UserAccount { get; set; }

    public string? PasswordHash { get; set; } // null nếu chưa từng đặt password nội bộ (Google-only)
}

namespace SportHub.Identity.Domain.Entities;

public class Role
{
    public int RoleId { get; set; } // PK

    public UserRole RoleName { get; set; } // unique, 4 giá trị cố định (seed data)

    public ICollection<UserAccount> UserAccounts { get; set; } = new List<UserAccount>();
}

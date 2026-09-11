using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

public class UserAccount
{
    public Guid UserId { get; set; } // PK, FK đích của hầu hết entity khác

    public string Email { get; set; } = string.Empty; // unique, không phân biệt hoa/thường

    public int RoleId { get; set; } // FK -> Role

    public Role? Role { get; set; }

    public UserStatus Status { get; set; } // Active/Banned/Deactivated — không xoá cứng user

    public DateTime CreatedAt { get; set; }

    public UserCredential? Credential { get; set; } // 1-1, null nếu account thuần Google

    public UserProfile? Profile { get; set; } // 1-1, thông tin hiển thị

    public ICollection<UserExternalLogin> ExternalLogins { get; set; } = new List<UserExternalLogin>(); // 1-N provider đăng nhập ngoài
}

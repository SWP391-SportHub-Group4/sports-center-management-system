namespace SportHub.Identity.Domain.Entities;

public class UserAccount
{
    public Guid UserId { get; set; } // PK, FK đích của hầu hết entity khác

    public string Email { get; set; } = string.Empty; // unique, không phân biệt hoa/thường

    public int RoleId { get; set; } // FK -> Role

    public Role? Role { get; set; }

    public UserStatus Status { get; set; } // Active/Banned/Deactivated — không xoá cứng user

    // Đổi khi reset/đổi mật khẩu hoặc đổi vai trò; JWT mang claim sst để vô hiệu phiên cũ (BR-103/104).
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    public DateTime CreatedAt { get; set; }

    public UserCredential? Credential { get; set; } // 1-1, null nếu account thuần Google

    public UserProfile? Profile { get; set; } // 1-1, thông tin hiển thị

    public ICollection<UserExternalLogin> ExternalLogins { get; set; } = new List<UserExternalLogin>(); // 1-N provider đăng nhập ngoài

    // 1-1, chỉ có ý nghĩa khi RoleId = Coach; giữ lại làm lịch sử nếu đổi role (SSOT §7, 28/09/2026 (2)).
    public CoachProfile? CoachProfile { get; set; }
}

namespace SportHub.Identity.Domain.Entities;

/// <summary>
/// Hồ sơ mở rộng của tài khoản role Coach nội bộ. Chuyên môn theo môn nằm ở <see cref="UserSportSpecialty"/>
/// (thay CoachCategory cũ); ở đây chỉ còn mô tả. Vòng đời khi đổi role: giữ record làm lịch sử, RoleId hiện tại quyết định hiệu lực.
/// </summary>
public class CoachProfile
{
    public Guid UserId { get; set; } // PK, đồng thời FK -> UserAccount (1-1)

    public UserAccount? UserAccount { get; set; }

    public string? Bio { get; set; }
}

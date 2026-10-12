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

    /// <summary>Chức danh hiển thị trên hồ sơ công khai (vd. "Senior Personal Trainer").</summary>
    public string? Title { get; set; }

    public int? YearsExperience { get; set; }

    /// <summary>Số học viên đã đào tạo do Manager nhập tay; không suy ra từ dữ liệu hệ thống.</summary>
    public int? StudentCount { get; set; }

    public string? Philosophy { get; set; }
}

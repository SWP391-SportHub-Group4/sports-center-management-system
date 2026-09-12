using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.HasKey(e => e.RoleId);
        // Unique — 5 giá trị cố định, seed data (BR-55, ràng buộc #12; bổ sung SystemAdministrator 11/09/2026).
        builder.HasIndex(e => e.RoleName).IsUnique();

        // Seed 5 role cố định (SSOT §2/§3) — migration sẽ tự insert, không cần insert tay.
        // SystemAdministrator (RoleId=5) bổ sung do thiết kế hệ thống (BR-2/BR-3), không có trong đề bài gốc.
        builder.HasData(
            new Role { RoleId = 1, RoleName = UserRole.CenterManager },
            new Role { RoleId = 2, RoleName = UserRole.Coach },
            new Role { RoleId = 3, RoleName = UserRole.Member },
            new Role { RoleId = 4, RoleName = UserRole.Receptionist },
            new Role { RoleId = 5, RoleName = UserRole.SystemAdministrator }
        );
    }
}

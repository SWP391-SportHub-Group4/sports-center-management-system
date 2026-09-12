using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class UserAccountConfiguration : IEntityTypeConfiguration<UserAccount>
{
    public void Configure(EntityTypeBuilder<UserAccount> builder)
    {
        builder.HasKey(e => e.UserId);

        builder.Property(e => e.Email).HasColumnType("citext");
        // Unique không phân biệt hoa/thường qua citext (BR-1/BR-49, ràng buộc #9).
        builder.HasIndex(e => e.Email).IsUnique();

        builder.HasOne(e => e.Role)
            .WithMany(r => r.UserAccounts)
            .HasForeignKey(e => e.RoleId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

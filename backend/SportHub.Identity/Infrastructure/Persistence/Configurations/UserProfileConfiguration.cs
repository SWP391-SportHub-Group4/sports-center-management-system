using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class UserProfileConfiguration : IEntityTypeConfiguration<UserProfile>
{
    public void Configure(EntityTypeBuilder<UserProfile> builder)
    {
        builder.HasKey(e => e.UserId);

        // Unique nếu có giá trị — partial unique index (BR-54, ràng buộc #11).
        builder.HasIndex(e => e.Phone)
            .IsUnique()
            .HasFilter("phone IS NOT NULL");

        builder.HasOne(e => e.UserAccount)
            .WithOne(u => u.Profile)
            .HasForeignKey<UserProfile>(e => e.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

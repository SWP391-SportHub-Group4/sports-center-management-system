using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class CoachProfileConfiguration : IEntityTypeConfiguration<CoachProfile>
{
    public void Configure(EntityTypeBuilder<CoachProfile> builder)
    {
        builder.HasKey(e => e.UserId);

        // Ordinal int mặc định của EF Core — khớp convention hiện có của mọi enum khác trong
        // hệ thống (UserStatus, ExternalAuthProvider...), không tự đổi sang lưu string (SSOT §3).
        builder.HasOne(e => e.UserAccount)
            .WithOne(u => u.CoachProfile)
            .HasForeignKey<CoachProfile>(e => e.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

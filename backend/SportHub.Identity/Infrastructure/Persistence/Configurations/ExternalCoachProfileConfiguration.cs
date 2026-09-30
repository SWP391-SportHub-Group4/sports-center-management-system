using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public class ExternalCoachProfileConfiguration : IEntityTypeConfiguration<ExternalCoachProfile>
{
    public void Configure(EntityTypeBuilder<ExternalCoachProfile> builder)
    {
        builder.HasKey(e => e.UserId);

        builder.HasOne(e => e.UserAccount)
            .WithOne()
            .HasForeignKey<ExternalCoachProfile>(e => e.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Người duyệt là user khác; Restrict để không mất dấu vết duyệt.
        builder.HasOne<UserAccount>()
            .WithMany()
            .HasForeignKey(e => e.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => e.ApprovalStatus);
    }
}

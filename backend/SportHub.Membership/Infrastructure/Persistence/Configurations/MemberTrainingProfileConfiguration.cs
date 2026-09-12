using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Membership.Infrastructure.Persistence.Configurations;

public class MemberTrainingProfileConfiguration : IEntityTypeConfiguration<MemberTrainingProfile>
{
    public void Configure(EntityTypeBuilder<MemberTrainingProfile> builder)
    {
        builder.HasKey(e => e.ProfileId);
        // Unique — 1 Member chỉ có 1 hồ sơ (ràng buộc 1–1 với UserAccount).
        builder.HasIndex(e => e.MemberId).IsUnique();

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

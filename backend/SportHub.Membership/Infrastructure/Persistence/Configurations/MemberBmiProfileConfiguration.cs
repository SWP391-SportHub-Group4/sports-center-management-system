using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Membership.Infrastructure.Persistence.Configurations;

public sealed class MemberBmiProfileConfiguration : IEntityTypeConfiguration<MemberBmiProfile>
{
    public void Configure(EntityTypeBuilder<MemberBmiProfile> builder)
    {
        builder.HasKey(p => p.MemberId);
        builder.Property(p => p.MemberId).ValueGeneratedNever();
        builder.Property(p => p.HeightCm).HasPrecision(5, 1);
        builder.Property(p => p.WeightKg).HasPrecision(5, 1);
        builder.HasOne(p => p.Member).WithMany().HasForeignKey(p => p.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<SportHub.Identity.Domain.Entities.UserAccount>().WithMany().HasForeignKey(p => p.RecordedById).OnDelete(DeleteBehavior.Restrict);
        builder.ToTable("member_bmi_profiles", table => table.HasCheckConstraint("ck_bmi_complete_measurement",
            "(measured_at IS NULL AND height_cm IS NULL AND weight_kg IS NULL AND recorded_by_id IS NULL) OR " +
            "(measured_at IS NOT NULL AND height_cm IS NOT NULL AND weight_kg IS NOT NULL AND height_cm BETWEEN 50 AND 250 AND weight_kg BETWEEN 10 AND 400 AND recorded_by_id IS NOT NULL)"));
    }
}

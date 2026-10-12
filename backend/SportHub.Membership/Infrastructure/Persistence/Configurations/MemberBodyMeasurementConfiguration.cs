using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Membership.Infrastructure.Persistence.Configurations;

public sealed class MemberBodyMeasurementConfiguration : IEntityTypeConfiguration<MemberBodyMeasurement>
{
    public void Configure(EntityTypeBuilder<MemberBodyMeasurement> builder)
    {
        builder.HasKey(x => x.MeasurementId);
        builder.Property(x => x.MeasurementId).ValueGeneratedNever();
        builder.Property(x => x.HeightCm).HasPrecision(5, 1);
        builder.Property(x => x.WeightKg).HasPrecision(5, 1);
        builder.HasOne(x => x.Member).WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => new { x.MemberId, x.MeasuredAt });
        builder.ToTable("member_body_measurements", t => t.HasCheckConstraint("ck_member_body_measurement_range",
            "height_cm BETWEEN 100 AND 250 AND weight_kg BETWEEN 30 AND 300"));
    }
}

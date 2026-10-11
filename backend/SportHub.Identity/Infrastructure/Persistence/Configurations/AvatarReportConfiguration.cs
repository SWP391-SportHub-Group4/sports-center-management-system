using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class AvatarReportConfiguration : IEntityTypeConfiguration<AvatarReport>
{
    public void Configure(EntityTypeBuilder<AvatarReport> builder)
    {
        builder.HasKey(x => x.ReportId);
        builder.Property(x => x.AvatarUrl).HasMaxLength(2048);
        builder.Property(x => x.AvatarPublicId).HasMaxLength(255);
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.Status).HasMaxLength(20);
        builder.HasIndex(x => new { x.TargetUserId, x.Status });
        builder.HasIndex(x => new { x.ReporterUserId, x.TargetUserId, x.Status });
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.TargetUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReporterUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReviewedById).OnDelete(DeleteBehavior.Restrict);
    }
}

using SportHub.Identity.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class AvatarReportConfiguration : IEntityTypeConfiguration<AvatarReport>
{
    public void Configure(EntityTypeBuilder<AvatarReport> b)
    {
        b.HasKey(x => x.ReportId);
        b.Property(x => x.AvatarUrl).HasMaxLength(2048);
        b.Property(x => x.Reason).HasMaxLength(500);
        b.Property(x => x.Status).HasMaxLength(20);
        b.HasIndex(x => new { x.Status, x.CreatedAtUtc });
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.TargetUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReporterUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Administration.Infrastructure.Persistence.Configurations;

public class ReportExportConfiguration : IEntityTypeConfiguration<ReportExport>
{
    public void Configure(EntityTypeBuilder<ReportExport> builder)
    {
        builder.HasKey(e => e.ReportExportId);
        builder.Property(e => e.ReportType).HasMaxLength(64);
        builder.Property(e => e.ParametersJson).HasColumnType("jsonb");
        builder.Property(e => e.FailureReason).HasMaxLength(1000);

        // BR-45: danh sách "báo cáo của tôi" lọc theo người tạo, sắp xếp theo thời gian.
        builder.HasIndex(e => new { e.RequestedByUserId, e.CreatedAt });

        builder.HasOne(e => e.RequestedByUser)
            .WithMany()
            .HasForeignKey(e => e.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

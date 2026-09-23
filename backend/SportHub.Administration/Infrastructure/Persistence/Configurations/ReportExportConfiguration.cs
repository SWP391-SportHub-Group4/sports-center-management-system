using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Administration.Infrastructure.Persistence.Configurations;

public class ReportExportConfiguration : IEntityTypeConfiguration<ReportExport>
{
    public void Configure(EntityTypeBuilder<ReportExport> builder)
    {
        builder.HasKey(e => e.ReportExportId);
        builder.Property(e => e.ReportType).HasMaxLength(64);

        // SSOT §5.7: Format là string whitelist (Csv/Pdf), không phải enum. CHECK ở DB để một
        // đường ghi khác không đưa được giá trị lạ vào — locator file suy ra từ giá trị này.
        builder.Property(e => e.Format).HasMaxLength(16).IsRequired();
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_report_exports_format_allowed",
            "format IN ('Csv', 'Pdf')"));
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

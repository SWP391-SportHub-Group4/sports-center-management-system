using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.HasKey(e => e.InvoiceId);
        // Unique, sinh từ DB sequence ở service layer, không random ở app (BR-58, ràng buộc #5).
        builder.HasIndex(e => e.InvoiceNumber).IsUnique();
        builder.Property(e => e.TotalAmount).HasPrecision(18, 0);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.IssuedByUser)
            .WithMany()
            .HasForeignKey(e => e.IssuedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Danh sách hoá đơn của một member và bộ lọc quá hạn (BR-55) là hai truy vấn chính.
        builder.HasIndex(e => new { e.MemberId, e.Status });
        builder.HasIndex(e => e.DueDateUtc);

        builder.HasOne(e => e.MemberPackage)
            .WithMany()
            .HasForeignKey(e => e.MemberPackageId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

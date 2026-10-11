using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class EnrollmentConfiguration : IEntityTypeConfiguration<Enrollment>
{
    public void Configure(EntityTypeBuilder<Enrollment> builder)
    {
        builder.ToTable("enrollments");
        builder.HasKey(e => e.EnrollmentId);

        builder.HasOne(e => e.Class).WithMany().HasForeignKey(e => e.ClassId).OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Enrollment>()
            .WithMany()
            .HasForeignKey(e => e.SourceEnrollmentId)
            .OnDelete(DeleteBehavior.Restrict);

        // Một Member chỉ có một ghi danh Confirmed trong mỗi lớp (Confirmed = 0).
        builder.HasIndex(e => new { e.ClassId, e.MemberId })
            .IsUnique()
            .HasFilter("status = 0")
            .HasDatabaseName("ux_enrollments_class_member_confirmed");

        builder.HasIndex(e => new { e.MemberId, e.Status });

        // Mỗi InvoiceItem chỉ sinh tối đa một ghi danh (idempotency của fulfillment).
        builder.HasIndex(e => e.InvoiceItemId)
            .IsUnique()
            .HasFilter("invoice_item_id IS NOT NULL AND status = 0")
            .HasDatabaseName("ux_enrollments_invoice_item");
    }
}

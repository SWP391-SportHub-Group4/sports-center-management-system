using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.HasKey(e => e.InvoiceId);
        builder.HasIndex(e => e.InvoiceNumber).IsUnique();
        builder.Property(e => e.TotalAmount).HasPrecision(18, 0);
        builder.Property(e => e.CashAmount).HasPrecision(18, 0);
        builder.ToTable("invoices", table => table.HasCheckConstraint("ck_invoice_point_split",
            "points_applied >= 0 AND cash_amount >= 0 AND (checkout_cycle_id IS NULL OR cash_amount + points_applied::numeric * 1000 = total_amount)"));

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.IssuedByUser)
            .WithMany()
            .HasForeignKey(e => e.IssuedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.MemberId, e.Status });

        builder.HasOne(e => e.MemberPackage)
            .WithMany()
            .HasForeignKey(e => e.MemberPackageId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

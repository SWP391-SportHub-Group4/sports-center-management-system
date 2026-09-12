using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class PaymentAdjustmentConfiguration : IEntityTypeConfiguration<PaymentAdjustment>
{
    public void Configure(EntityTypeBuilder<PaymentAdjustment> builder)
    {
        builder.HasKey(e => e.AdjustmentId);
        builder.Property(e => e.Amount).HasPrecision(18, 0);

        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.Adjustments)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Payment)
            .WithMany(p => p.Adjustments)
            .HasForeignKey(e => e.PaymentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.RequestedByUser)
            .WithMany()
            .HasForeignKey(e => e.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ApprovedByUser)
            .WithMany()
            .HasForeignKey(e => e.ApprovedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

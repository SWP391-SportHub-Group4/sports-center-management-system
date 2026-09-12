using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class PaymentConfiguration : IEntityTypeConfiguration<Domain.Entities.Payment>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.Payment> builder)
    {
        builder.HasKey(e => e.PaymentId);
        builder.Property(e => e.Amount).HasPrecision(18, 0);

        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.Payments)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ReceivedByUser)
            .WithMany()
            .HasForeignKey(e => e.ReceivedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

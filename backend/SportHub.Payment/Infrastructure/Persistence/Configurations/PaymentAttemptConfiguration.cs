using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public class PaymentAttemptConfiguration : IEntityTypeConfiguration<PaymentAttempt>
{
    public void Configure(EntityTypeBuilder<PaymentAttempt> builder)
    {
        builder.HasKey(e => e.PaymentAttemptId);

        builder.Property(e => e.VnpTxnRef).IsRequired().HasMaxLength(100);
        builder.HasIndex(e => e.VnpTxnRef).IsUnique();

        builder.Property(e => e.Amount).HasPrecision(18, 0);
        builder.Property(e => e.VnpExpireDate).IsRequired();
        builder.Property(e => e.CreatedAt).IsRequired();
        builder.Property(e => e.Status).IsRequired();

        builder.HasOne(e => e.Invoice)
            .WithMany(i => i.PaymentAttempts)
            .HasForeignKey(e => e.InvoiceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.InvoiceId, e.Status });
    }
}

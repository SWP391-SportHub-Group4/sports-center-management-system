using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public sealed class CheckoutSessionConfiguration : IEntityTypeConfiguration<CheckoutSession>
{
    public void Configure(EntityTypeBuilder<CheckoutSession> b)
    {
        b.HasKey(x => x.CheckoutSessionId);
        b.Property(x => x.IdempotencyKey).HasMaxLength(120).IsRequired();
        b.Property(x => x.Kind).HasMaxLength(30).IsRequired();
        b.Property(x => x.State).HasMaxLength(30).IsRequired();
        b.HasIndex(x => new { x.InvoiceId, x.Revision }).IsUnique();
        b.HasIndex(x => new { x.InvoiceId, x.State });
        b.HasIndex(x => new { x.InvoiceId, x.IdempotencyKey }).IsUnique();
        b.HasOne<Invoice>().WithMany().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
    }
}

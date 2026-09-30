using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Payment.Infrastructure.Persistence.Configurations;

public sealed class VerifiedGatewayEventConfiguration : IEntityTypeConfiguration<VerifiedGatewayEvent>
{
    public void Configure(EntityTypeBuilder<VerifiedGatewayEvent> b)
    {
        b.HasKey(x => x.VerifiedGatewayEventId);
        b.Property(x => x.Provider).HasMaxLength(30).IsRequired();
        b.Property(x => x.ProviderTransactionId).HasMaxLength(100).IsRequired();
        b.Property(x => x.TransactionReference).HasMaxLength(100).IsRequired();
        b.Property(x => x.Amount).HasPrecision(18, 0);
        b.Property(x => x.ResponseCode).HasMaxLength(10).IsRequired();
        b.Property(x => x.TransactionStatus).HasMaxLength(10).IsRequired();
        b.Property(x => x.ProcessingStatus).HasMaxLength(40).IsRequired();
        b.Property(x => x.LastError).HasMaxLength(1000);
        b.HasIndex(x => new { x.Provider, x.ProviderTransactionId }).IsUnique();
        b.HasIndex(x => new { x.ProcessingStatus, x.VerifiedAtUtc });
        b.HasOne<PaymentAttempt>().WithMany().HasForeignKey(x => x.PaymentAttemptId).OnDelete(DeleteBehavior.Restrict);
    }
}

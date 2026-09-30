using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Persistence;

public sealed class PointConfirmationConfiguration : IEntityTypeConfiguration<PointConfirmation>
{
    public void Configure(EntityTypeBuilder<PointConfirmation> builder)
    {
        builder.ToTable("point_confirmations", table => table.HasCheckConstraint(
            "ck_point_confirmation_attempts", "failed_attempts >= 0 AND failed_attempts <= 5 AND points > 0"));
        builder.HasKey(x => x.PointConfirmationId);
        builder.Property(x => x.CodeHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.CodeSalt).HasMaxLength(32).IsRequired();
        builder.HasIndex(x => new { x.InvoiceId, x.CreatedAtUtc });
        builder.HasIndex(x => new { x.MemberId, x.CreatedAtUtc });
    }
}

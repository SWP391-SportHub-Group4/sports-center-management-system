using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportPayoutConfiguration : IEntityTypeConfiguration<MemberSupportPayout>
{
    public void Configure(EntityTypeBuilder<MemberSupportPayout> builder)
    {
        builder.ToTable("member_support_payouts", table =>
            table.HasCheckConstraint("ck_member_support_payout_amount_positive", "amount > 0"));
        builder.HasKey(x => x.PayoutId);
        builder.HasIndex(x => x.RequestId).IsUnique();
        builder.HasIndex(x => x.InvoiceId);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Note).HasMaxLength(1000);
        builder.Property(x => x.MemberConfirmedBy).HasMaxLength(20);
        builder.HasOne<MemberSupportRequest>().WithOne().HasForeignKey<MemberSupportPayout>(x => x.RequestId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RecordedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

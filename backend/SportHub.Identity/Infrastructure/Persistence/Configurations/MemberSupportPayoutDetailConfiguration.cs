using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Identity.Infrastructure.Persistence.Configurations;

public sealed class MemberSupportPayoutDetailConfiguration : IEntityTypeConfiguration<MemberSupportPayoutDetail>
{
    public void Configure(EntityTypeBuilder<MemberSupportPayoutDetail> builder)
    {
        builder.ToTable("member_support_payout_details");
        builder.HasKey(x => x.RequestId);
        builder.Property(x => x.BankName).HasMaxLength(120);
        builder.Property(x => x.AccountNumberEncrypted).HasMaxLength(2048);
        builder.Property(x => x.AccountLast4).HasMaxLength(4);
        builder.Property(x => x.AccountHolder).HasMaxLength(160);
        builder.HasOne<MemberSupportRequest>().WithOne().HasForeignKey<MemberSupportPayoutDetail>(x => x.RequestId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

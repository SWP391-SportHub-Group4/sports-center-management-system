using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Persistence;

public sealed class PointGiftConfiguration : IEntityTypeConfiguration<PointGift>
{
    public void Configure(EntityTypeBuilder<PointGift> b)
    {
        b.ToTable("point_gifts", t => t.HasCheckConstraint("ck_point_gift_positive", "points > 0"));
        b.HasKey(x => x.GiftId);
        b.Property(x => x.Reason).HasMaxLength(1000).IsRequired();
        b.HasIndex(x => new { x.BatchId, x.MemberId }).IsUnique();
        b.HasIndex(x => new { x.IncidentId, x.MemberId }).IsUnique().HasFilter("incident_id IS NOT NULL");
        b.HasIndex(x => x.LedgerEntryId).IsUnique();
        b.HasIndex(x => x.CreatedAtUtc);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ManagerId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PointLedgerEntry>().WithMany().HasForeignKey(x => x.LedgerEntryId).OnDelete(DeleteBehavior.Restrict);
    }
}

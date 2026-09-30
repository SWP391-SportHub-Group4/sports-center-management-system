using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Persistence;

public sealed class PointLedgerEntryConfiguration : IEntityTypeConfiguration<PointLedgerEntry>
{
    public void Configure(EntityTypeBuilder<PointLedgerEntry> builder)
    {
        builder.ToTable("point_ledger_entries", table =>
        {
            table.HasCheckConstraint("ck_point_ledger_balance", "available_after >= 0 AND held_after >= 0 AND points > 0");
            table.HasCheckConstraint("ck_point_ledger_deltas", """
                (entry_type = 0 AND available_delta = -points AND held_delta = points) OR
                (entry_type = 1 AND available_delta = points AND held_delta = -points) OR
                (entry_type = 2 AND available_delta = 0 AND held_delta = -points) OR
                (entry_type = 3 AND available_delta = points AND held_delta = 0) OR
                (entry_type = 4 AND held_delta = 0 AND (available_delta = points OR available_delta = -points))
                """);
        });
        builder.HasKey(x => x.LedgerEntryId);
        builder.Property(x => x.ReferenceType).HasMaxLength(80).IsRequired();
        builder.Property(x => x.Note).HasMaxLength(1000);
        builder.HasIndex(x => new { x.WalletId, x.ReferenceType, x.ReferenceId, x.EntryType }).IsUnique();
        builder.HasIndex(x => new { x.WalletId, x.CreatedAtUtc, x.LedgerEntryId });
        builder.HasOne<PointWallet>().WithMany().HasForeignKey(x => x.WalletId).OnDelete(DeleteBehavior.Restrict);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Persistence;

public sealed class PointCreditRequestConfiguration : IEntityTypeConfiguration<PointCreditRequest>
{
    public void Configure(EntityTypeBuilder<PointCreditRequest> builder)
    {
        builder.ToTable("point_credit_requests", table =>
        {
            table.HasCheckConstraint("ck_point_credit_positive", "points > 0");
            table.HasCheckConstraint("ck_point_credit_status", "status IN (0, 1, 2)");
            table.HasCheckConstraint("ck_point_credit_separate_approver",
                "decided_by_user_id IS NULL OR decided_by_user_id <> requested_by_user_id");
            table.HasCheckConstraint("ck_point_credit_resolution", """
                (status = 0 AND decided_by_user_id IS NULL AND decided_at_utc IS NULL AND ledger_entry_id IS NULL AND decision_reason IS NULL) OR
                (status = 1 AND decided_by_user_id IS NOT NULL AND decided_at_utc IS NOT NULL AND ledger_entry_id IS NOT NULL AND decision_reason IS NULL) OR
                (status = 2 AND decided_by_user_id IS NOT NULL AND decided_at_utc IS NOT NULL AND ledger_entry_id IS NULL AND decision_reason IS NOT NULL)
                """);
        });
        builder.HasKey(x => x.RequestId);
        builder.Property(x => x.Reason).HasMaxLength(1000).IsRequired();
        builder.Property(x => x.DecisionReason).HasMaxLength(500);
        builder.HasIndex(x => new { x.Status, x.RequestedAtUtc });
        builder.HasIndex(x => new { x.OwnerUserId, x.RequestedAtUtc });
        builder.HasIndex(x => x.LedgerEntryId).IsUnique();
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.DecidedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PointLedgerEntry>().WithMany().HasForeignKey(x => x.LedgerEntryId).OnDelete(DeleteBehavior.Restrict);
    }
}

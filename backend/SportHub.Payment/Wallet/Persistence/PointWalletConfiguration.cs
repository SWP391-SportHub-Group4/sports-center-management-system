using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Wallet.Persistence;

public sealed class PointWalletConfiguration : IEntityTypeConfiguration<PointWallet>
{
    public void Configure(EntityTypeBuilder<PointWallet> builder)
    {
        builder.ToTable("point_wallets", table => table.HasCheckConstraint(
            "ck_point_wallets_balance", "available_points >= 0 AND held_points >= 0"));
        builder.HasKey(x => x.WalletId);
        builder.HasIndex(x => x.OwnerUserId).IsUnique();
    }
}

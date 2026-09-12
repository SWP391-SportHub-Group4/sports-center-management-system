using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Membership.Infrastructure.Persistence.Configurations;

public class MembershipPackageConfiguration : IEntityTypeConfiguration<MembershipPackage>
{
    public void Configure(EntityTypeBuilder<MembershipPackage> builder)
    {
        builder.HasKey(e => e.PackageId);
        // Unique trong catalog (BR-56, ràng buộc #13).
        builder.HasIndex(e => e.Name).IsUnique();
        // Tiền VND, số nguyên, không phần thập phân (SSOT §5.2).
        builder.Property(e => e.Price).HasPrecision(18, 0);
    }
}

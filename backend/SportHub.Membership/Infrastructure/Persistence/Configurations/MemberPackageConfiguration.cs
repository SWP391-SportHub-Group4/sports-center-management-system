using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Membership.Infrastructure.Persistence.Configurations;

public class MemberPackageConfiguration : IEntityTypeConfiguration<MemberPackage>
{
    public void Configure(EntityTypeBuilder<MemberPackage> builder)
    {
        builder.HasKey(e => e.MemberPackageId);

        // Optimistic concurrency — tránh lost-update (ràng buộc #8).
        builder.Property(e => e.Version).IsConcurrencyToken();

        // Bảo vệ thêm ở tầng DB (không thay thế transaction atomic ở service layer,
        // xem Design v2 §3 ràng buộc #3): remaining_sessions không âm khi có giá trị.
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_member_packages_remaining_sessions_non_negative",
            "remaining_sessions IS NULL OR remaining_sessions >= 0"));

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Package)
            .WithMany(p => p.MemberPackages)
            .HasForeignKey(e => e.PackageId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

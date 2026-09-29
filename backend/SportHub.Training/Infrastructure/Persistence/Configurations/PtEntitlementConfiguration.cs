using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class PtEntitlementConfiguration : IEntityTypeConfiguration<PtEntitlement>
{
    public void Configure(EntityTypeBuilder<PtEntitlement> builder)
    {
        builder.HasKey(e => e.EntitlementId);

        // Optimistic concurrency — RemainingQuota bị tính lại mỗi lần book/cancel/reschedule,
        // phải khoá version thật (khác MemberPackage.Version hiện tại chưa từng được tăng).
        builder.Property(e => e.Version).IsConcurrencyToken();

        // Postgres cho phép nhiều NULL trong unique index (PendingPayment chưa có reference).
        builder.HasIndex(e => e.ActivationReference).IsUnique();

        builder.HasIndex(e => new { e.MemberId, e.Status });

        builder.ToTable(t =>
        {
            t.HasCheckConstraint(
                "CK_pt_entitlements_frequency_per_week",
                "frequency_per_week IN (1, 2, 3)");

            t.HasCheckConstraint(
                "CK_pt_entitlements_quota_counters_non_negative",
                "reserved_sessions >= 0 AND consumed_sessions >= 0");

            t.HasCheckConstraint(
                "CK_pt_entitlements_quota_within_total",
                "reserved_sessions + consumed_sessions <= total_quota");
        });

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.OriginMemberPackage)
            .WithMany()
            .HasForeignKey(e => e.OriginMemberPackageId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.CurrentMemberPackage)
            .WithMany()
            .HasForeignKey(e => e.CurrentMemberPackageId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

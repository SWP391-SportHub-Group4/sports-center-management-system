using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class PtCoachChangeRequestConfiguration : IEntityTypeConfiguration<PtCoachChangeRequest>
{
    public void Configure(EntityTypeBuilder<PtCoachChangeRequest> builder)
    {
        builder.HasKey(e => e.RequestId);

        // Mỗi entitlement tối đa 1 request đổi Coach đang Pending (PtCoachChangeRequestStatus.Pending = 0).
        builder.HasIndex(e => e.EntitlementId)
            .IsUnique()
            .HasFilter($"status = {(int)PtCoachChangeRequestStatus.Pending}");

        builder.HasOne(e => e.Entitlement)
            .WithMany(en => en.CoachChangeRequests)
            .HasForeignKey(e => e.EntitlementId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.CurrentCoach)
            .WithMany()
            .HasForeignKey(e => e.CurrentCoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.RequestedCoach)
            .WithMany()
            .HasForeignKey(e => e.RequestedCoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ReviewedByUser)
            .WithMany()
            .HasForeignKey(e => e.ReviewedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

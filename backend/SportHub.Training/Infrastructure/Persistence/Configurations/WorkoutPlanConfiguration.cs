using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class WorkoutPlanConfiguration : IEntityTypeConfiguration<WorkoutPlan>
{
    public void Configure(EntityTypeBuilder<WorkoutPlan> builder)
    {
        builder.HasKey(e => e.PlanId);

        // Mới 29/09/2026 (BE-4) — update items theo transaction, không để partial plan.
        builder.Property(e => e.Version).IsConcurrencyToken();

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Relationship)
            .WithMany(r => r.WorkoutPlans)
            .HasForeignKey(e => e.RelationshipId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

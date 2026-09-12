using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class WorkoutPlanItemConfiguration : IEntityTypeConfiguration<WorkoutPlanItem>
{
    public void Configure(EntityTypeBuilder<WorkoutPlanItem> builder)
    {
        builder.HasKey(e => e.ItemId);

        // Bài tập con chỉ có ý nghĩa gắn với đúng 1 plan — cascade khi xóa plan.
        builder.HasOne(e => e.Plan)
            .WithMany(p => p.Items)
            .HasForeignKey(e => e.PlanId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

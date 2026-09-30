using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class WorkoutResultConfiguration : IEntityTypeConfiguration<WorkoutResult>
{
    public void Configure(EntityTypeBuilder<WorkoutResult> builder)
    {
        builder.HasKey(e => e.ResultId);

        // Đổi 29/09/2026 (BE-4): 1-1 với PtSession — DB tự chặn ghi 2 result cho cùng 1 session.
        builder.HasIndex(e => e.PtSessionId).IsUnique();

        builder.HasOne(e => e.PtSession)
            .WithOne(s => s.Result)
            .HasForeignKey<WorkoutResult>(e => e.PtSessionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

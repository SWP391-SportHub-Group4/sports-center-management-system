using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class WorkoutResultConfiguration : IEntityTypeConfiguration<WorkoutResult>
{
    public void Configure(EntityTypeBuilder<WorkoutResult> builder)
    {
        builder.HasKey(e => e.ResultId);

        builder.HasOne(e => e.Enrollment)
            .WithMany()
            .HasForeignKey(e => e.EnrollmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

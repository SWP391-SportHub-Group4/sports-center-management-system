using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Threshold.Domain;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class ThresholdResponseConfiguration : IEntityTypeConfiguration<ThresholdResponse>
{
    public void Configure(EntityTypeBuilder<ThresholdResponse> builder)
    {
        builder.ToTable("class_threshold_responses", table =>
        {
            table.HasCheckConstraint("ck_class_threshold_response_choice_target",
                "(choice IS NULL AND target_class_id IS NULL) OR (choice IN (0, 2) AND target_class_id IS NULL) OR (choice = 1 AND target_class_id IS NOT NULL)");
        });
        builder.HasKey(x => x.ThresholdResponseId);
        builder.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => new { x.ClassId, x.EnrollmentId }).IsUnique();
        builder.HasIndex(x => new { x.ResolutionStatus, x.DeadlineUtc });
        builder.HasOne<Domain.Entities.Class>().WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.Enrollment>().WithMany().HasForeignKey(x => x.EnrollmentId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Domain.Entities.Class>().WithMany().HasForeignKey(x => x.TargetClassId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
    }
}

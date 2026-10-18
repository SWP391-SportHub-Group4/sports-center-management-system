using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Infrastructure;

public sealed class IncidentFenceStepConfiguration : IEntityTypeConfiguration<IncidentFenceStep>
{
    public void Configure(EntityTypeBuilder<IncidentFenceStep> builder)
    {
        builder.ToTable("incident_fence_steps");
        builder.HasKey(x => x.StepId);
        builder.Property(x => x.UndoNote).HasMaxLength(300);
        builder.Property(x => x.BlockReason).HasMaxLength(1000);
        builder.HasOne<IncidentFence>().WithMany().HasForeignKey(x => x.FenceId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.FenceId, x.CreatedAtUtc });
        // The journal lookup when a session changes.
        builder.HasIndex(x => x.SessionId);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Infrastructure;

public sealed class IncidentFenceConfiguration : IEntityTypeConfiguration<IncidentFence>
{
    public void Configure(EntityTypeBuilder<IncidentFence> builder)
    {
        builder.ToTable("incident_fences", t =>
            t.HasCheckConstraint("ck_incident_fence_range", "end_at_utc > start_at_utc"));
        builder.HasKey(x => x.FenceId);
        builder.Property(x => x.Reason).HasMaxLength(500);
        // The booking guard looks up Open fences overlapping a window.
        builder.HasIndex(x => new { x.Status, x.StartAtUtc, x.EndAtUtc });
    }
}

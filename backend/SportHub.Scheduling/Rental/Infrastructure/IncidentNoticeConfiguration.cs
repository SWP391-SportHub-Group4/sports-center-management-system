using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Infrastructure;

public sealed class IncidentNoticeConfiguration : IEntityTypeConfiguration<IncidentNotice>
{
    public void Configure(EntityTypeBuilder<IncidentNotice> builder)
    {
        builder.ToTable("incident_notices", t => t.HasCheckConstraint("ck_incident_notice_range", "end_at_utc > start_at_utc"));
        builder.HasKey(x => x.IncidentId);
        builder.Property(x => x.Reason).HasMaxLength(500);
        builder.Property(x => x.ResolutionSummary).HasMaxLength(2000);
        builder.HasIndex(x => new { x.Scope, x.RoomId, x.StartAtUtc });
    }
}

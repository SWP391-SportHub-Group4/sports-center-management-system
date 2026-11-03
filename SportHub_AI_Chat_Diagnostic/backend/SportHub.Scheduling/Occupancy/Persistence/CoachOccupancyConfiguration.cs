using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Persistence;

public class CoachOccupancyConfiguration : IEntityTypeConfiguration<CoachOccupancy>
{
    public void Configure(EntityTypeBuilder<CoachOccupancy> builder)
    {
        builder.ToTable("coach_occupancies", t => t.HasCheckConstraint("ck_coach_occupancies_range", "end_at_utc > start_at_utc"));
        builder.HasKey(e => e.OccupancyId);

        // coach_id trỏ tới user_accounts (Identity). FK scalar cấu hình ở CrossModuleRelationships.
        builder.HasIndex(e => new { e.SourceType, e.SourceId }).IsUnique();
        builder.HasIndex(e => new { e.CoachId, e.StartAtUtc });

        // Exclusion constraint theo coach: xem migration MultiSportOccupancy.
    }
}

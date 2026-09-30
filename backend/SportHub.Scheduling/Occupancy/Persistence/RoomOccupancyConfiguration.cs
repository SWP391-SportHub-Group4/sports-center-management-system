using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.Scheduling.Occupancy.Persistence;

public class RoomOccupancyConfiguration : IEntityTypeConfiguration<RoomOccupancy>
{
    public void Configure(EntityTypeBuilder<RoomOccupancy> builder)
    {
        builder.ToTable("room_occupancies", t => t.HasCheckConstraint("ck_room_occupancies_range", "end_at_utc > start_at_utc"));
        builder.HasKey(e => e.OccupancyId);

        builder.HasOne<Room>().WithMany().HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.SourceType, e.SourceId }).IsUnique();
        builder.HasIndex(e => new { e.RoomId, e.StartAtUtc });

        // Exclusion constraint chống trùng phòng (btree_gist + tstzrange) được tạo bằng SQL thô trong migration
        // MultiSportOccupancy: EF Core không mô hình hóa được EXCLUDE.
    }
}

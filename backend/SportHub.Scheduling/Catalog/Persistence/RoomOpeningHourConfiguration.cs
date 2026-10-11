using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class RoomOpeningHourConfiguration : IEntityTypeConfiguration<RoomOpeningHour>
{
    public void Configure(EntityTypeBuilder<RoomOpeningHour> builder)
    {
        builder.ToTable("room_opening_hours", t =>
        {
            t.HasCheckConstraint("ck_room_opening_hours_day", "day_of_week BETWEEN 0 AND 6");
            t.HasCheckConstraint("ck_room_opening_hours_range", "close_time_local > open_time_local");
        });
        builder.HasKey(e => new { e.RoomId, e.DayOfWeek });

        builder.HasOne<Room>().WithMany().HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);
    }
}

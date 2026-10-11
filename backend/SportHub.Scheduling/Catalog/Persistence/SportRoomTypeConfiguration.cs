using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class SportRoomTypeConfiguration : IEntityTypeConfiguration<SportRoomType>
{
    public void Configure(EntityTypeBuilder<SportRoomType> builder)
    {
        builder.ToTable("sport_room_types");
        builder.HasKey(e => new { e.SportId, e.RoomTypeId });

        builder.HasOne<Sport>().WithMany().HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<RoomType>().WithMany().HasForeignKey(e => e.RoomTypeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasData(
            new SportRoomType { SportId = 1, RoomTypeId = 1 },
            new SportRoomType { SportId = 1, RoomTypeId = 2 }, // phòng PT cùng thuộc môn Gym
            new SportRoomType { SportId = 3, RoomTypeId = 3 },
            new SportRoomType { SportId = 4, RoomTypeId = 4 });
    }
}

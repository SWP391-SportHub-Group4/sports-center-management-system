using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class RoomTypeConfiguration : IEntityTypeConfiguration<RoomType>
{
    public void Configure(EntityTypeBuilder<RoomType> builder)
    {
        builder.ToTable("room_types");
        builder.HasKey(e => e.RoomTypeId);
        builder.Property(e => e.IsActive).HasDefaultValue(true);
        builder.Property(e => e.Name).HasColumnType("citext").IsRequired();
        builder.HasIndex(e => e.Name).IsUnique();

        builder.HasData(
            new RoomType { RoomTypeId = 1, Name = "Gym room" },
            new RoomType { RoomTypeId = 3, Name = "Badminton court" },
            new RoomType { RoomTypeId = 4, Name = "Basketball court" });
    }
}

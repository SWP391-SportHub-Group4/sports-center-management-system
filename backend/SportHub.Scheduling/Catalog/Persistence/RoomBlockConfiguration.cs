using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class RoomBlockConfiguration : IEntityTypeConfiguration<RoomBlock>
{
    public void Configure(EntityTypeBuilder<RoomBlock> builder)
    {
        builder.ToTable("room_blocks", t => t.HasCheckConstraint("ck_room_blocks_range", "end_at_utc > start_at_utc"));
        builder.HasKey(e => e.BlockId);
        builder.Property(e => e.Reason).IsRequired();

        builder.HasOne<Room>().WithMany().HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(e => new { e.RoomId, e.StartAtUtc });
    }
}

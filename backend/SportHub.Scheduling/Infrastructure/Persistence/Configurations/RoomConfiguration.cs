using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class RoomConfiguration : IEntityTypeConfiguration<Room>
{
    public void Configure(EntityTypeBuilder<Room> builder)
    {
        builder.HasKey(e => e.RoomId);
        builder.Property(e => e.AllowRental).HasDefaultValue(false);
        builder.HasOne<SportHub.Scheduling.Catalog.Domain.Sport>().WithMany().HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Restrict);
        // A deleted room retains its historical name; a new room may reuse it.
        builder.HasIndex(e => e.Name).IsUnique().HasFilter("deleted_at_utc IS NULL");

        builder.HasOne<SportHub.Scheduling.Catalog.Domain.RoomType>()
            .WithMany()
            .HasForeignKey(e => e.RoomTypeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

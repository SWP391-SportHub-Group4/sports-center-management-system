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
        // Unique toàn trung tâm (BR-57, ràng buộc #14).
        builder.HasIndex(e => e.Name).IsUnique();

        builder.HasOne<SportHub.Scheduling.Catalog.Domain.RoomType>()
            .WithMany()
            .HasForeignKey(e => e.RoomTypeId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

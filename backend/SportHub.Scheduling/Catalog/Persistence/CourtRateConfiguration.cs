using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Catalog.Domain;

namespace SportHub.Scheduling.Catalog.Persistence;

public class CourtRateConfiguration : IEntityTypeConfiguration<CourtRate>
{
    public void Configure(EntityTypeBuilder<CourtRate> builder)
    {
        builder.ToTable("court_rates", t =>
        {
            t.HasCheckConstraint("ck_court_rates_price", "price_per_hour > 0 AND price_per_hour % 1000 = 0");
            t.HasCheckConstraint("ck_court_rates_range", "end_time_local > start_time_local");
        });
        builder.HasKey(e => e.RateId);
        builder.Property(e => e.DaysOfWeek).IsRequired();
        builder.Property(e => e.PricePerHour).HasPrecision(18, 0);

        builder.HasOne<RoomType>().WithMany().HasForeignKey(e => e.RoomTypeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Sport>().WithMany().HasForeignKey(e => e.SportId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(e => new { e.RoomTypeId, e.IsActive });
    }
}

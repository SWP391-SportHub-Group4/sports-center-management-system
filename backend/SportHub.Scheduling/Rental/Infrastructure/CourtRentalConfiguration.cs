using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Scheduling.Rental.Domain;

namespace SportHub.Scheduling.Rental.Infrastructure;

public sealed class CourtRentalConfiguration : IEntityTypeConfiguration<CourtRental>
{
    public void Configure(EntityTypeBuilder<CourtRental> builder)
    {
        builder.ToTable("court_rentals", t => t.HasCheckConstraint("ck_court_rentals_range", "end_at_utc > start_at_utc"));
        builder.HasKey(x => x.CourtRentalId);
        builder.Property(x => x.TotalPrice).HasPrecision(12, 2);
        builder.Property(x => x.PriceSnapshotJson).HasColumnType("jsonb");
        builder.Property(x => x.CancelReason).HasMaxLength(500);
        builder.HasIndex(x => new { x.ExternalCoachId, x.Status, x.StartAtUtc });
        builder.HasIndex(x => x.InvoiceItemId).IsUnique().HasFilter("invoice_item_id IS NOT NULL");
    }
}

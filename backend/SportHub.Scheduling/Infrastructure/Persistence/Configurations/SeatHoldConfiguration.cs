using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class SeatHoldConfiguration : IEntityTypeConfiguration<SeatHold>
{
    public void Configure(EntityTypeBuilder<SeatHold> builder)
    {
        builder.ToTable("seat_holds");
        builder.HasKey(e => e.HoldId);

        builder.HasOne(e => e.Class).WithMany().HasForeignKey(e => e.ClassId).OnDelete(DeleteBehavior.Restrict);

        // Một Member chỉ giữ một chỗ Active mỗi lớp (Active = 0): nhấp đúp checkout không nhân đôi chỗ.
        builder.HasIndex(e => new { e.ClassId, e.MemberId })
            .IsUnique()
            .HasFilter("status = 0")
            .HasDatabaseName("ux_seat_holds_class_member_active");

        // Job hết hạn quét theo (status, expires_at).
        builder.HasIndex(e => new { e.Status, e.ExpiresAtUtc });
        builder.HasIndex(e => e.InvoiceId);
    }
}

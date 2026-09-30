using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class PtSessionChangeRequestConfiguration : IEntityTypeConfiguration<PtSessionChangeRequest>
{
    public void Configure(EntityTypeBuilder<PtSessionChangeRequest> builder)
    {
        builder.HasKey(e => e.RequestId);

        // Mỗi session tối đa 1 request đang Pending (PtSessionChangeRequestStatus.Pending = 0).
        builder.HasIndex(e => e.SessionId)
            .IsUnique()
            .HasFilter($"status = {(int)PtSessionChangeRequestStatus.Pending}");

        builder.HasOne(e => e.Session)
            .WithMany(s => s.ChangeRequests)
            .HasForeignKey(e => e.SessionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.RequestedByUser)
            .WithMany()
            .HasForeignKey(e => e.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.ReviewedByUser)
            .WithMany()
            .HasForeignKey(e => e.ReviewedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

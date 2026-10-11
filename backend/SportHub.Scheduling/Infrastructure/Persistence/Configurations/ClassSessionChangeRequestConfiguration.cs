using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public sealed class ClassSessionChangeRequestConfiguration : IEntityTypeConfiguration<ClassSessionChangeRequest>
{
    public void Configure(EntityTypeBuilder<ClassSessionChangeRequest> b)
    {
        b.ToTable("class_session_change_requests", t => {
            t.HasCheckConstraint("ck_class_change_type", "type IN ('SUBSTITUTE','RESCHEDULE','CANCEL_WITH_MAKEUP')");
            t.HasCheckConstraint("ck_class_change_status", "status IN ('PENDING','RESOLVED','REJECTED','WITHDRAWN')");
        });
        b.HasKey(x => x.RequestId);
        b.Property(x => x.RequestId).ValueGeneratedNever();
        b.Property(x => x.Type).HasMaxLength(32);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.Reason).HasMaxLength(500);
        b.Property(x => x.ReviewNote).HasMaxLength(500);
        b.Property(x => x.ResolutionType).HasMaxLength(32);
        b.HasOne(x => x.Session).WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.RequestedBy).WithMany().HasForeignKey(x => x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<ClassSession>().WithMany().HasForeignKey(x => x.ResultSessionId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => x.SessionId).IsUnique().HasFilter("status = 'PENDING'");
        b.HasIndex(x => new { x.Status, x.CreatedAtUtc });
        b.HasIndex(x => new { x.RequestedByUserId, x.CreatedAtUtc });
    }
}

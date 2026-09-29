using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassSessionConfiguration : IEntityTypeConfiguration<ClassSession>
{
    public void Configure(EntityTypeBuilder<ClassSession> builder)
    {
        builder.ToTable("class_sessions", t =>
        {
            t.HasCheckConstraint("ck_class_sessions_range", "end_at_utc > start_at_utc");
            t.HasCheckConstraint("ck_class_sessions_no", "session_no > 0");
        });

        builder.HasKey(e => e.SessionId);

        builder.HasOne(e => e.Class)
            .WithMany(c => c.Sessions)
            .HasForeignKey(e => e.ClassId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Room).WithMany().HasForeignKey(e => e.RoomId).OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ClassSession>()
            .WithMany()
            .HasForeignKey(e => e.RescheduledFromSessionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.ClassId, e.SessionNo }).IsUnique();
        builder.HasIndex(e => new { e.StartAtUtc, e.Status });
        builder.HasIndex(e => new { e.CoachId, e.StartAtUtc });
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class AttendanceConfiguration : IEntityTypeConfiguration<Attendance>
{
    public void Configure(EntityTypeBuilder<Attendance> builder)
    {
        builder.ToTable("attendances");
        builder.HasKey(e => e.AttendanceId);

        builder.HasOne(e => e.Enrollment).WithMany().HasForeignKey(e => e.EnrollmentId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(e => e.Session).WithMany().HasForeignKey(e => e.SessionId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(e => new { e.EnrollmentId, e.SessionId }).IsUnique();
        builder.HasIndex(e => e.SessionId);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class AttendanceConfiguration : IEntityTypeConfiguration<Attendance>
{
    public void Configure(EntityTypeBuilder<Attendance> builder)
    {
        builder.HasKey(e => e.AttendanceId);

        // Ràng buộc #17: 1 Enrollment chỉ có tối đa 1 Attendance (1-1).
        builder.HasIndex(e => e.EnrollmentId).IsUnique();

        builder.HasOne(e => e.Enrollment)
            .WithOne(en => en.Attendance)
            .HasForeignKey<Attendance>(e => e.EnrollmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.CheckedInByUser)
            .WithMany()
            .HasForeignKey(e => e.CheckedInByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class EnrollmentConfiguration : IEntityTypeConfiguration<Enrollment>
{
    public void Configure(EntityTypeBuilder<Enrollment> builder)
    {
        builder.HasKey(e => e.EnrollmentId);

        // Ràng buộc #1: không đăng ký trùng vào cùng 1 session (partial unique
        // index, EnrollmentStatus.Confirmed = 0) — cho phép đăng ký lại sau khi hủy.
        builder.HasIndex(e => new { e.SessionId, e.MemberId })
            .IsUnique()
            .HasFilter($"status = {(int)EnrollmentStatus.Confirmed}");

        builder.HasOne(e => e.Session)
            .WithMany(s => s.Enrollments)
            .HasForeignKey(e => e.SessionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.MemberPackage)
            .WithMany()
            .HasForeignKey(e => e.MemberPackageId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.CancelledByUser)
            .WithMany()
            .HasForeignKey(e => e.CancelledByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

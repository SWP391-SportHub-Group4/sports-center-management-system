using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class ClassSessionConfiguration : IEntityTypeConfiguration<ClassSession>
{
    public void Configure(EntityTypeBuilder<ClassSession> builder)
    {
        builder.HasKey(e => e.SessionId);

        // Bảo vệ thêm ở tầng DB (không thay thế transaction atomic ở service layer,
        // xem Design v2 §3 ràng buộc #2): confirmed_count trong khoảng [0, capacity].
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_class_sessions_confirmed_count_within_capacity",
            "confirmed_count >= 0 AND confirmed_count <= capacity"));

        builder.HasOne(e => e.Class)
            .WithMany(c => c.Sessions)
            .HasForeignKey(e => e.ClassId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Recurrence)
            .WithMany(r => r.Sessions)
            .HasForeignKey(e => e.RecurrenceId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Room)
            .WithMany(r => r.Sessions)
            .HasForeignKey(e => e.RoomId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        // Self-reference — buổi được dời lịch trỏ về buổi gốc.
        builder.HasOne(e => e.RescheduledFromSession)
            .WithMany()
            .HasForeignKey(e => e.RescheduledFromSessionId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

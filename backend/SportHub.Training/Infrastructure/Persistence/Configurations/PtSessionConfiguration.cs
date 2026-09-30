using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Training.Infrastructure.Persistence.Configurations;

public class PtSessionConfiguration : IEntityTypeConfiguration<PtSession>
{
    public void Configure(EntityTypeBuilder<PtSession> builder)
    {
        builder.HasKey(e => e.SessionId);

        builder.Property(e => e.Version).IsConcurrencyToken();

        // Tra lịch theo Coach/Member là truy vấn nóng nhất (dò conflict khi tạo/reschedule,
        // lịch của chính Coach/Member) — cùng tiền lệ ClassSessionConfiguration.
        builder.HasIndex(e => new { e.CoachId, e.StartAtUtc });
        builder.HasIndex(e => new { e.MemberId, e.StartAtUtc });

        // Bảo vệ thêm ở tầng DB: session luôn đúng 90 phút — service chỉ nhận StartAtUtc và
        // tự tính EndAtUtc, nhưng không tin tưởng tuyệt đối application layer.
        //
        // KHÔNG có exclusion constraint (btree_gist) chặn 2 session Scheduled giao nhau cùng
        // Coach/Member ở migration này — chưa kiểm được trên Postgres thật trong môi trường này.
        // Overlap được chặn ở service layer bằng transaction + kiểm tra trong cùng transaction
        // (xem PtSessionLifecycle Phase 3) và phủ bằng concurrency test; thêm exclusion constraint
        // là việc cần làm tiếp sau khi xác nhận trên Postgres thật (xem BE-4 §7).
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_pt_sessions_duration_is_ninety_minutes",
            "end_at_utc = start_at_utc + interval '90 minutes'"));

        builder.HasOne(e => e.Entitlement)
            .WithMany(en => en.Sessions)
            .HasForeignKey(e => e.EntitlementId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(e => e.Coach)
            .WithMany()
            .HasForeignKey(e => e.CoachId)
            .OnDelete(DeleteBehavior.Restrict);

        // Self-reference — session thay thế trỏ về session gốc, giữ nguyên tiền lệ ClassSession.
        builder.HasOne(e => e.RescheduledFromSession)
            .WithMany()
            .HasForeignKey(e => e.RescheduledFromSessionId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

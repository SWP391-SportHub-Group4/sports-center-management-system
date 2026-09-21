using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SportHub.Scheduling.Infrastructure.Persistence.Configurations;

public class GymCheckInConfiguration : IEntityTypeConfiguration<GymCheckIn>
{
    public void Configure(EntityTypeBuilder<GymCheckIn> builder)
    {
        // Đặt tên bảng tường minh: snake_case tự động của EF sinh ra "gym_check_ins",
        // lệch với ERD (Design v2 §2.3, block GYM_CHECKINS).
        builder.ToTable("gym_checkins");

        builder.HasKey(e => e.CheckInId);

        // Cột đặt tên tường minh vì doc lệch nhau: ERD ghi check_in_time_utc, còn SSOT §2
        // và entity-field-purpose.md ghi CheckInTime. Chốt theo SSOT và theo tiền lệ
        // Attendance.CheckInTime (cùng module, cũng là mốc UTC); ERD đã sửa cho khớp.
        builder.Property(e => e.CheckInTime).HasColumnName("check_in_time");

        // Đường đọc duy nhất hiện có là "lịch sử của 1 Member, mới nhất trước".
        // KHÔNG unique theo (member, ngày): BR-64 cho phép nhiều lần check-in mỗi ngày.
        builder.HasIndex(e => new { e.MemberId, e.CheckInTime })
            .IsDescending(false, true);

        builder.HasOne(e => e.Member)
            .WithMany()
            .HasForeignKey(e => e.MemberId)
            .OnDelete(DeleteBehavior.Restrict);

        // Not-null: Gym check-in luôn do Lễ tân ghi nhận, không có nhánh job tự sinh như
        // Attendance.CheckedInByUserId (nullable cho NoShow).
        builder.HasOne(e => e.CheckedInByUser)
            .WithMany()
            .HasForeignKey(e => e.CheckedInByUserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);
    }
}

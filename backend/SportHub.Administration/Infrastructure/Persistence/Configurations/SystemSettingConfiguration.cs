using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SportHub.BuildingBlocks.Abstractions.Configuration;

namespace SportHub.Administration.Infrastructure.Persistence.Configurations;

public class SystemSettingConfiguration : IEntityTypeConfiguration<SystemSetting>
{
    public void Configure(EntityTypeBuilder<SystemSetting> builder)
    {
        builder.HasKey(e => e.Key);
        builder.Property(e => e.Key).HasMaxLength(64);
        builder.Property(e => e.Value).HasMaxLength(256);
        builder.Property(e => e.Description).HasMaxLength(512);

        builder.HasOne(e => e.UpdatedByUser)
            .WithMany()
            .HasForeignKey(e => e.UpdatedByUserId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        // Seed hai khoá đang dùng. Giá trị mặc định là CẤU HÌNH KỸ THUẬT ban đầu, không phải
        // số lấy từ Business Rules: BR-50 không nêu số giờ cụ thể, BR-33 chỉ ghi "ví dụ: 7 ngày".
        // UpdatedAt để mốc cố định (không DateTime.UtcNow) vì HasData yêu cầu giá trị hằng —
        // giá trị động sẽ làm mỗi lần chạy `dotnet ef migrations add` lại sinh ra một migration mới.
        builder.HasData(
            new SystemSetting
            {
                Key = SystemSettingKeys.CancellationDeadlineHours,
                Value = "12",
                Description = "BR-50 — Số giờ tối thiểu trước giờ bắt đầu buổi học mà hội viên phải hủy "
                              + "để được hoàn lượt tập. Giá trị được chụp lại tại thời điểm đăng ký; "
                              + "thay đổi ở đây không ảnh hưởng các đăng ký đã xác nhận.",
                UpdatedAt = new DateTime(2026, 9, 21, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.PackageExpiringReminderDays,
                Value = "7",
                Description = "BR-33 — Nhắc hội viên trước bao nhiêu ngày khi gói thành viên sắp hết hạn.",
                UpdatedAt = new DateTime(2026, 9, 21, 0, 0, 0, DateTimeKind.Utc)
            });
    }
}

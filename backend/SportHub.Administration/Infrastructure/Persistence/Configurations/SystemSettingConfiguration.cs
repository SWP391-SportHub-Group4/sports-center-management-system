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

        // Chỉ seed chính sách còn được phép cấu hình. Hạn hủy lớp là quy tắc cố định 30 phút,
        // không phải SystemSetting.
        // UpdatedAt để mốc cố định (không DateTime.UtcNow) vì HasData yêu cầu giá trị hằng —
        // giá trị động sẽ làm mỗi lần chạy `dotnet ef migrations add` lại sinh ra một migration mới.
        builder.HasData(
            new SystemSetting
            {
                Key = SystemSettingKeys.PackageExpiringReminderDays,
                Value = "7",
                Description = "BR-33 — Nhắc hội viên trước bao nhiêu ngày khi gói thành viên sắp hết hạn.",
                UpdatedAt = new DateTime(2026, 9, 21, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.ClassThresholdDaysBeforeStart,
                Value = "3",
                Description = "BR-119 — Đánh giá ngưỡng hoàn vốn của khóa trước buổi đầu bao nhiêu ngày.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.ClassThresholdResponseHours,
                Value = "48",
                Description = "BR-120 — Số giờ Member được trả lời khi khóa học có nguy cơ không đủ ngưỡng.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.HoldMinutes,
                Value = "15",
                Description = "BR-115 — Số phút giữ chỗ và thanh toán tối đa khi checkout.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.PtPricePerSessionVnd,
                Value = "200000",
                Description = "Đơn giá demo PT mỗi buổi; Center Manager cần xác nhận giá kinh doanh.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.PointsConfirmOtpMinutes,
                Value = "5",
                Description = "BR-139 — Số phút OTP tại quầy xác nhận dùng điểm còn hiệu lực.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalSlotMinutes,
                Value = "60",
                Description = "BR-126 — Độ dài mỗi khối thuê sân (30 hoặc 60 phút).",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalMaxHours,
                Value = "4",
                Description = "BR-128 — Thời lượng thuê sân tối đa theo giờ.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalAdvanceDays,
                Value = "30",
                Description = "BR-128 — Số ngày tối đa được đặt sân trước.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalCancelFreeHours,
                Value = "24",
                Description = "BR-129 — Hủy miễn phí nếu còn ít nhất số giờ này trước lượt thuê.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            });
    }
}

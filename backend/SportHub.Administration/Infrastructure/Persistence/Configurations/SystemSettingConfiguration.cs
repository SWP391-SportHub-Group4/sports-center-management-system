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
                Value = "10",
                Description = "BR-33 — Days before membership expiration to remind members.",
                UpdatedAt = new DateTime(2026, 9, 21, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.ClassThresholdDaysBeforeStart,
                Value = "3",
                Description = "BR-119 — Days before the first session to evaluate the course threshold.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.ClassThresholdResponseHours,
                Value = "48",
                Description = "BR-120 — Hours for members to respond when a course risks missing its threshold.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.HoldMinutes,
                Value = "15",
                Description = "BR-115 — Maximum minutes to hold a place and complete checkout.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.PointsConfirmOtpMinutes,
                Value = "5",
                Description = "BR-139 — Minutes a points confirmation OTP remains valid at reception.",
                UpdatedAt = new DateTime(2026, 9, 30, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalSlotMinutes,
                Value = "60",
                Description = "BR-126 — Court rental slot length (30 or 60 minutes).",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalMaxHours,
                Value = "4",
                Description = "BR-128 — Maximum court rental duration in hours.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalAdvanceDays,
                Value = "3",
                Description = "BR-128 — Maximum days to book a court in advance.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new SystemSetting
            {
                Key = SystemSettingKeys.RentalCancelFreeHours,
                Value = "24",
                Description = "BR-129 — Minimum hours before a rental for free cancellation.",
                UpdatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)
            });
    }
}

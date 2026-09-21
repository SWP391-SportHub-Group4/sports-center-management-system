using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Administration.Application.Services;

public sealed record SystemSettingDto(string Key, string Value, string Description, DateTime UpdatedAt);

public sealed class UpdateSystemSettingRequest
{
    [Required]
    public string Value { get; set; } = string.Empty;
}

public interface ISystemSettingService
{
    Task<IReadOnlyList<SystemSettingDto>> GetAllAsync(CancellationToken ct = default);

    Task<SystemSettingDto> UpdateAsync(string key, string value, Guid actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Cấu hình toàn hệ thống (BR-39 — chỉ Center Manager). Thay đổi ở đây KHÔNG hồi tố:
/// hạn huỷ đã được chụp vào từng Enrollment lúc đăng ký (BR-50).
/// </summary>
public sealed class SystemSettingService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : ISystemSettingService
{
    // Khoảng giá trị hợp lệ — chặn cấu hình vô nghĩa (0 giờ = huỷ lúc nào cũng "đúng hạn";
    // 1 năm = không bao giờ đúng hạn). Cận trên/dưới là phòng vệ kỹ thuật, không phải số từ BR.
    private static readonly IReadOnlyDictionary<string, (int Min, int Max)> IntRanges =
        new Dictionary<string, (int, int)>
        {
            [SystemSettingKeys.CancellationDeadlineHours] = (1, 720),
            [SystemSettingKeys.PackageExpiringReminderDays] = (1, 90)
        };

    public async Task<IReadOnlyList<SystemSettingDto>> GetAllAsync(CancellationToken ct = default)
        => await db.Set<SystemSetting>()
            .AsNoTracking()
            .OrderBy(s => s.Key)
            .Select(s => new SystemSettingDto(s.Key, s.Value, s.Description, s.UpdatedAt))
            .ToListAsync(ct);

    public async Task<SystemSettingDto> UpdateAsync(
        string key,
        string value,
        Guid actorUserId,
        CancellationToken ct = default)
    {
        var setting = await db.Set<SystemSetting>().SingleOrDefaultAsync(s => s.Key == key, ct)
            ?? throw new NotFoundException("setting_not_found", $"Không có cấu hình '{key}'.");

        if (IntRanges.TryGetValue(key, out var range))
        {
            if (!int.TryParse(value, out var parsed) || parsed < range.Min || parsed > range.Max)
            {
                throw new BadRequestException(
                    "invalid_setting_value",
                    $"Giá trị của '{key}' phải là số nguyên trong khoảng {range.Min}–{range.Max}.");
            }
        }

        var previous = setting.Value;
        setting.Value = value;
        setting.UpdatedByUserId = actorUserId;
        setting.UpdatedAt = clock.UtcNow;

        audit.Write(new AuditEntry(
            actorUserId,
            "UPDATE_SYSTEM_SETTING",
            nameof(SystemSetting),
            key,
            OldValue: $"{{\"value\":\"{previous}\"}}",
            NewValue: $"{{\"value\":\"{value}\"}}"));

        await db.SaveChangesAsync(ct);

        return new SystemSettingDto(setting.Key, setting.Value, setting.Description, setting.UpdatedAt);
    }
}

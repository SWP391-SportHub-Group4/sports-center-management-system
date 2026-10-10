using Microsoft.EntityFrameworkCore;
using SportHub.Administration.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using System.ComponentModel.DataAnnotations;

namespace SportHub.Administration.Application.Services;

public sealed record SystemSettingResponse(string Key, string Value, string Description, DateTime UpdatedAt);

public sealed class UpdateSystemSettingRequest
{
    [Required]
    public string Value { get; set; } = string.Empty;
}

/// <summary>
/// Chính sách vận hành được phép cấu hình (BR-39 — chỉ Center Manager).
/// </summary>
public sealed class SystemSettingService(
    ISportHubDbContext db,
    IAuditWriter audit,
    IClock clock) : ISystemSettingService
{
    // Cận trên/dưới là phòng vệ kỹ thuật, không phải số từ BR.
    private static readonly IReadOnlyDictionary<string, (int Min, int Max)> IntRanges =
        new Dictionary<string, (int, int)>
        {
            [SystemSettingKeys.MembershipExpiryNoticeDays] = (1, 90),
            [SystemSettingKeys.ClassThresholdDaysBeforeStart] = (1, 30),
            [SystemSettingKeys.ClassThresholdResponseHours] = (1, 336),
            [SystemSettingKeys.HoldMinutes] = (1, 1440),
            [SystemSettingKeys.PointsConfirmOtpMinutes] = (1, 15),
            [SystemSettingKeys.RentalSlotMinutes] = (30, 60),
            [SystemSettingKeys.RentalMaxHours] = (1, 4),
            [SystemSettingKeys.RentalAdvanceDays] = (1, 30),
            [SystemSettingKeys.RentalCancelFreeHours] = (0, 168),
            [SystemSettingKeys.PtPricePerSessionVnd] = (1_000, 100_000_000),
            [SystemSettingKeys.PtSelfBookMinLeadHours] = (1, 168),
            [SystemSettingKeys.PtSelfBookMaxAdvanceDays] = (1, 90)
        };

    public async Task<IReadOnlyList<SystemSettingResponse>> GetAllAsync(CancellationToken ct = default)
        => await db.Set<SystemSetting>()
            .AsNoTracking()
            .OrderBy(s => s.Key)
            .Select(s => new SystemSettingResponse(s.Key, s.Value, s.Description, s.UpdatedAt))
            .ToListAsync(ct);

    public async Task<SystemSettingResponse> UpdateAsync(
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
            if (key == SystemSettingKeys.PtPricePerSessionVnd && parsed % 1000 != 0)
                throw new BadRequestException("invalid_setting_value", "Đơn giá PT phải là bội số của 1.000 VND.");
            if (key == SystemSettingKeys.RentalSlotMinutes && parsed is not (30 or 60))
                throw new BadRequestException("invalid_setting_value", "Khối thuê sân phải là 30 hoặc 60 phút.");
            if (key is SystemSettingKeys.PtSelfBookMinLeadHours or SystemSettingKeys.PtSelfBookMaxAdvanceDays)
            {
                var otherKey = key == SystemSettingKeys.PtSelfBookMinLeadHours
                    ? SystemSettingKeys.PtSelfBookMaxAdvanceDays : SystemSettingKeys.PtSelfBookMinLeadHours;
                var otherValue = await db.Set<SystemSetting>().AsNoTracking()
                    .Where(s => s.Key == otherKey).Select(s => s.Value).SingleAsync(ct);
                var other = int.Parse(otherValue, System.Globalization.CultureInfo.InvariantCulture);
                var lead = key == SystemSettingKeys.PtSelfBookMinLeadHours ? parsed : other;
                var days = key == SystemSettingKeys.PtSelfBookMaxAdvanceDays ? parsed : other;
                if (lead >= days * 24)
                    throw new BadRequestException("invalid_setting_value", "Thời gian báo trước PT phải ngắn hơn khoảng ngày cho phép đặt trước.");
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

        return new SystemSettingResponse(setting.Key, setting.Value, setting.Description, setting.UpdatedAt);
    }
}

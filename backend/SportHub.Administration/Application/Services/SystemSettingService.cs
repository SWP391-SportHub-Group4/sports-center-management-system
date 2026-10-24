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
            [SystemSettingKeys.ClassThresholdDaysBeforeStart] = (3, 30),
            [SystemSettingKeys.ClassThresholdResponseHours] = (1, 48),
            [SystemSettingKeys.HoldMinutes] = (CheckoutHoldPolicy.MinMinutes, CheckoutHoldPolicy.MaxMinutes),
            [SystemSettingKeys.PointsConfirmOtpMinutes] = (1, 15),
            [SystemSettingKeys.RentalSlotMinutes] = (30, 60),
            [SystemSettingKeys.RentalMaxHours] = (1, 4),
            [SystemSettingKeys.RentalAdvanceDays] = (1, 30),
            [SystemSettingKeys.RentalCancelFreeHours] = (0, 168),
            [SystemSettingKeys.SupportSlaHours] = (1, 168),
            [SystemSettingKeys.SupportRemindCooldownHours] = (1, 168),
            [SystemSettingKeys.SupportPayoutConfirmDays] = (1, 30)
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
            ?? throw new NotFoundException("setting_not_found", "Setting not found.");

        if (IntRanges.TryGetValue(key, out var range))
        {
            if (!int.TryParse(value, out var parsed) || parsed < range.Min || parsed > range.Max)
            {
                throw new BadRequestException(
                    "invalid_setting_value",
                    $"Setting '{key}' must be an integer between {range.Min} and {range.Max}.");
            }
            if (key == SystemSettingKeys.RentalSlotMinutes && parsed is not (30 or 60))
                throw new BadRequestException("invalid_setting_value", "The rental slot must be 30 or 60 minutes.");
            if (key is SystemSettingKeys.ClassThresholdDaysBeforeStart or SystemSettingKeys.ClassThresholdResponseHours)
            {
                var otherKey = key == SystemSettingKeys.ClassThresholdDaysBeforeStart
                    ? SystemSettingKeys.ClassThresholdResponseHours : SystemSettingKeys.ClassThresholdDaysBeforeStart;
                var otherValue = await db.Set<SystemSetting>().AsNoTracking()
                    .Where(x => x.Key == otherKey).Select(x => x.Value).SingleAsync(ct);
                if (!int.TryParse(otherValue, out var other))
                    throw new ConflictException("class_threshold_window_setting_invalid", "The related threshold setting is invalid.");
                var days = key == SystemSettingKeys.ClassThresholdDaysBeforeStart ? parsed : other;
                var hours = key == SystemSettingKeys.ClassThresholdResponseHours ? parsed : other;
                if (hours is < 1 or > 48 || days < 3 || days * 24 < hours + 24)
                    throw new BadRequestException("class_threshold_window_setting_invalid",
                        "Review at least three days before class and leave the full response window plus 24 hours to finalize it.");
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

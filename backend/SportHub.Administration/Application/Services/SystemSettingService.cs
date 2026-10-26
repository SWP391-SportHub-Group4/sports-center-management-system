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

public sealed class UpdateSystemSettingsRequest
{
    [Required]
    public Dictionary<string, string> Values { get; set; } = [];
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
            [SystemSettingKeys.HoldMinutes] = (CheckoutHoldPolicy.MinMinutes, CheckoutHoldPolicy.MaxMinutes),
            [SystemSettingKeys.PointsConfirmOtpMinutes] = (1, 15),
            [SystemSettingKeys.RentalSlotMinutes] = (30, 60),
            [SystemSettingKeys.RentalMaxHours] = (1, 4),
            [SystemSettingKeys.SupportSlaHours] = (1, 168),
            [SystemSettingKeys.SupportRemindCooldownHours] = (1, 168),
            [SystemSettingKeys.SupportPayoutConfirmDays] = (1, 30)
        };

    private static readonly string[] RetiredKeys =
    [SystemSettingKeys.ClassThresholdResponseHours, SystemSettingKeys.RentalAdvanceDays, SystemSettingKeys.RentalCancelFreeHours];

    public async Task<IReadOnlyList<SystemSettingResponse>> GetAllAsync(CancellationToken ct = default)
        => await db.Set<SystemSetting>().AsNoTracking()
            .Where(s => !RetiredKeys.Contains(s.Key))
            .OrderBy(s => s.Key)
            .Select(s => new SystemSettingResponse(s.Key, s.Value, s.Description, s.UpdatedAt)).ToListAsync(ct);

    public async Task<SystemSettingResponse> UpdateAsync(string key, string value, Guid actorUserId, CancellationToken ct = default)
        => (await UpdateManyAsync(new Dictionary<string, string> { [key] = value }, actorUserId, ct)).Single();

    public async Task<IReadOnlyList<SystemSettingResponse>> UpdateManyAsync(
        IReadOnlyDictionary<string, string> values, Guid actorUserId, CancellationToken ct = default)
    {
        if (values is null || values.Count is < 1 or > 20)
            throw new BadRequestException("invalid_settings", "Provide between 1 and 20 settings.");
        var parsed = new Dictionary<string, int>();
        foreach (var (key, value) in values)
        {
            if (RetiredKeys.Contains(key))
                throw new BadRequestException("setting_retired", "This setting is no longer configurable.");
            var centerTime = key is SystemSettingKeys.CenterOpeningMinutes or SystemSettingKeys.CenterClosingMinutes;
            if (!centerTime && !IntRanges.ContainsKey(key))
                throw new BadRequestException("setting_not_editable", "This setting cannot be changed here.");
            var (min, max) = centerTime ? (0, 1439) : IntRanges[key];
            if (!int.TryParse(value, out var number) || number < min || number > max)
                throw new BadRequestException("invalid_setting_value", $"Setting '{key}' must be an integer between {min} and {max}.");
            if (key == SystemSettingKeys.RentalSlotMinutes && number is not (30 or 60))
                throw new BadRequestException("invalid_setting_value", "The rental slot must be 30 or 60 minutes.");
            parsed[key] = number;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var keys = values.Keys.ToList();
        var changesHours = keys.Contains(SystemSettingKeys.CenterOpeningMinutes) || keys.Contains(SystemSettingKeys.CenterClosingMinutes);
        if (changesHours)
        {
            keys.Add(SystemSettingKeys.CenterOpeningMinutes);
            keys.Add(SystemSettingKeys.CenterClosingMinutes);
        }
        var lockKeys = keys.Distinct().Order().ToArray();
        var rows = await db.Set<SystemSetting>().FromSqlInterpolated(
            $"SELECT * FROM system_settings WHERE key = ANY({lockKeys}) ORDER BY key FOR UPDATE").ToListAsync(ct);
        if (rows.Count != lockKeys.Length)
            throw new NotFoundException("setting_not_found", "One or more settings could not be found.");
        if (changesHours)
        {
            int Read(string key) => parsed.TryGetValue(key, out var number) ? number : int.Parse(rows.Single(s => s.Key == key).Value);
            if (Read(SystemSettingKeys.CenterOpeningMinutes) >= Read(SystemSettingKeys.CenterClosingMinutes))
                throw new BadRequestException("invalid_center_hours", "The center opening time must be before its closing time.");
        }

        var now = clock.UtcNow;
        var changed = new List<SystemSettingResponse>();
        foreach (var row in rows.Where(s => values.ContainsKey(s.Key)))
        {
            var value = parsed[row.Key].ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (row.Value != value)
            {
                var previous = row.Value;
                row.Value = value;
                row.UpdatedAt = now;
                row.UpdatedByUserId = actorUserId;
                audit.Write(new AuditEntry(actorUserId, "UPDATE_SYSTEM_SETTING", nameof(SystemSetting), row.Key,
                    OldValue: System.Text.Json.JsonSerializer.Serialize(new { value = previous }),
                    NewValue: System.Text.Json.JsonSerializer.Serialize(new { value })));
            }
            changed.Add(new(row.Key, row.Value, row.Description, row.UpdatedAt));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return changed;
    }
}

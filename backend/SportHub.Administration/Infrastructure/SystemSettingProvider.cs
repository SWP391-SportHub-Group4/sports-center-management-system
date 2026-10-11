using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Administration.Infrastructure;

/// <summary>
/// Bản cài đặt <see cref="ISystemSettingProvider"/> (BR-39).
/// Không cache để thay đổi chính sách vận hành có hiệu lực ở lần chạy job tiếp theo.
/// </summary>
public sealed class SystemSettingProvider(ISportHubDbContext db) : ISystemSettingProvider
{
    public async Task<VersionedIntSetting> GetVersionedIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var source = db.Database.CurrentTransaction is null
            ? db.Set<SystemSetting>().AsNoTracking()
            : db.Set<SystemSetting>().FromSqlInterpolated(
                $"SELECT * FROM system_settings WHERE key = {key} FOR SHARE").AsNoTracking();
        var row = await source
            .Where(s => s.Key == key).Select(s => new { s.Value, s.UpdatedAt })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException($"Thiếu system setting '{key}'.");
        if (!int.TryParse(row.Value, out var value))
            throw new InvalidOperationException($"System setting '{key}' không phải số nguyên.");
        return new VersionedIntSetting(value, row.UpdatedAt.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    public async Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var raw = await db.Set<SystemSetting>()
            .AsNoTracking()
            .Where(s => s.Key == key)
            .Select(s => s.Value)
            .SingleOrDefaultAsync(cancellationToken);

        // Thiếu khoá hoặc giá trị hỏng là lỗi cấu hình, không phải trường hợp nghiệp vụ hợp lệ.
        if (raw is null)
        {
            throw new InvalidOperationException($"Thiếu system setting '{key}' — kiểm tra seed data.");
        }

        return int.TryParse(raw, out var value)
            ? value
            : throw new InvalidOperationException($"System setting '{key}' không phải số nguyên: '{raw}'.");
    }
}

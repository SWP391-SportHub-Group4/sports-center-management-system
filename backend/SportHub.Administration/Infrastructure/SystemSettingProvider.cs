using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Configuration;
using SportHub.BuildingBlocks.Abstractions.Persistence;

namespace SportHub.Administration.Infrastructure;

/// <summary>
/// Bản cài đặt <see cref="ISystemSettingProvider"/> (BR-39).
///
/// KHÔNG cache: các khoá này được đọc ở đường ghi nghiệp vụ (chụp hạn huỷ vào Enrollment,
/// BR-50) và một giá trị cũ trong cache sẽ được chụp vĩnh viễn vào bản ghi. Truy vấn là một
/// lần đọc theo PK nên rẻ.
/// </summary>
public sealed class SystemSettingProvider(ISportHubDbContext db) : ISystemSettingProvider
{
    public async Task<int> GetIntAsync(string key, CancellationToken cancellationToken = default)
    {
        var raw = await db.Set<SystemSetting>()
            .AsNoTracking()
            .Where(s => s.Key == key)
            .Select(s => s.Value)
            .SingleOrDefaultAsync(cancellationToken);

        // Thiếu khoá hoặc giá trị hỏng là lỗi cấu hình, không phải trường hợp nghiệp vụ hợp lệ.
        // Ném thay vì lặng lẽ dùng mặc định: một mặc định ẩn ở đây sẽ bị CHỤP vào Enrollment
        // (BR-50) và về sau không ai biết đăng ký đó đang áp chính sách nào.
        if (raw is null)
        {
            throw new InvalidOperationException($"Thiếu system setting '{key}' — kiểm tra seed data.");
        }

        return int.TryParse(raw, out var value)
            ? value
            : throw new InvalidOperationException($"System setting '{key}' không phải số nguyên: '{raw}'.");
    }
}

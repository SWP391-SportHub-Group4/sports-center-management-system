using Microsoft.AspNetCore.Http;
using SportHub.BuildingBlocks.Abstractions.Audit;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Audit.Infrastructure;

/// <summary>
/// Bản cài đặt <see cref="IAuditWriter"/> (BR-7).
///
/// Chỉ Add vào change tracker, KHÔNG SaveChanges — caller phải commit cùng transaction với
/// thao tác nghiệp vụ. Nếu writer tự lưu thì khi thao tác gốc rollback, audit vẫn còn lại và
/// nhật ký sẽ ghi những việc chưa từng xảy ra.
/// </summary>
public sealed class AuditWriter(
    ISportHubDbContext db,
    IHttpContextAccessor httpContextAccessor,
    IClock clock) : IAuditWriter
{
    public void Write(AuditEntry entry)
    {
        db.Set<AuditLog>().Add(new AuditLog
        {
            AuditId = Guid.NewGuid(),
            UserId = entry.ActorUserId,
            Action = entry.Action,
            TargetEntity = entry.TargetEntity,
            TargetId = entry.TargetId,
            OldValue = entry.OldValue,

            // Lý do (BR-7 với khoá/mở khoá, BR-42 với duyệt điều chỉnh) đi kèm NewValue thay vì
            // thêm cột mới: AuditLog là entity đã chốt ở SSOT §2 và NewValue vốn là jsonb tự do.
            NewValue = Combine(entry.NewValue, entry.Reason),

            // Job nền không có HttpContext — ghi chuỗi rỗng thay vì null vì cột not-null.
            IpAddress = httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            Timestamp = clock.UtcNow
        });
    }

    private static string? Combine(string? newValue, string? reason)
    {
        if (reason is null)
        {
            return newValue;
        }

        var escapedReason = System.Text.Json.JsonSerializer.Serialize(reason);

        return newValue is null
            ? $"{{\"reason\":{escapedReason}}}"
            : $"{{\"value\":{newValue},\"reason\":{escapedReason}}}";
    }
}

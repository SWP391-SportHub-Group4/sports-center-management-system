using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;

namespace SportHub.API.Jobs;

/// <summary>
/// BR-34 — "gửi" thông báo bất đồng bộ: hành động gốc chỉ ghi dòng Pending trong cùng
/// transaction của nó, job này mới chuyển sang Sent. Nhờ vậy không có đường nào để lỗi gửi
/// làm hỏng việc hủy lớp hay thu tiền.
///
/// MVP chỉ có kênh InApp thật sự hoạt động (SSOT §1.3): "gửi" ở đây nghĩa là đánh dấu thông
/// báo đã sẵn sàng hiển thị, không gọi ra SMS/email gateway nào. Khi nối gateway thật, chỗ
/// cần sửa là đúng vòng lặp này, còn RetryCount/Failed đã có sẵn chỗ để dùng.
/// </summary>
public sealed class NotificationDispatchJob(
    IServiceProvider services,
    ILogger<NotificationDispatchJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromSeconds(30))
{
    protected override string JobName => nameof(NotificationDispatchJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var db = scopedServices.GetRequiredService<SportHubDbContext>();
        var clock = scopedServices.GetRequiredService<IClock>();
        var now = clock.UtcNow;

        var dispatched = await db.Notifications
            .Where(n => n.Status == NotificationStatus.Pending && n.Channel == NotificationChannel.InApp)
            .ExecuteUpdateAsync(
                s => s.SetProperty(n => n.Status, NotificationStatus.Sent)
                      .SetProperty(n => n.SentAt, now)
                      .SetProperty(n => n.LastAttemptAt, now),
                ct);

        if (dispatched > 0)
        {
            logger.LogInformation("BR-34: đã phát {Count} thông báo InApp.", dispatched);
        }
    }
}

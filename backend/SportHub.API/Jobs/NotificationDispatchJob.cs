using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Notification.Domain.Enums;
using SportHub.Notification.Application.Services;

namespace SportHub.API.Jobs;

/// <summary>
/// BR-34 — "gửi" thông báo bất đồng bộ: hành động gốc chỉ ghi dòng Pending trong cùng
/// transaction của nó, job này mới chuyển sang Sent. Nhờ vậy không có đường nào để lỗi gửi
/// làm hỏng việc hủy lớp hay thu tiền.
///
/// InApp được đánh dấu sẵn sàng hiển thị bằng cập nhật database; email đi qua dispatcher
/// riêng có lease/retry và chỉ ghi Sent sau khi sender xác nhận thành công.
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

        var emailCount = await scopedServices.GetRequiredService<EmailDispatchService>().DispatchBatchAsync(ct);
        if (emailCount > 0) logger.LogInformation("NotificationDispatchJob claimed {Count} email outbox rows.", emailCount);
    }
}

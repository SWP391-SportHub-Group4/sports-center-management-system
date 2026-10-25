using SportHub.Payment.Application.Services;

namespace SportHub.API.Jobs;

/// <summary>Quá 2 ngày kể từ lúc trung tâm hủy mà Member chưa chọn cách hoàn thì tự hoàn 100% bằng điểm.</summary>
public sealed class CenterCancellationAutoRefundJob(IServiceProvider services,
    ILogger<CenterCancellationAutoRefundJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(10))
{
    protected override string JobName => nameof(CenterCancellationAutoRefundJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var count = await scopedServices.GetRequiredService<ICenterCancellationRefundService>().AutoRefundDueAsync(ct);
        if (count > 0) logger.LogInformation("CenterCancellationAutoRefundJob refunded {Count} center-cancelled items.", count);
    }
}

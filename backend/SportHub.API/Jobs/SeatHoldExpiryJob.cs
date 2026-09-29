using SportHub.Scheduling.Application.Services;

namespace SportHub.API.Jobs;

/// <summary>
/// BR-115 — hết hạn giữ chỗ mỗi phút: hold Active quá hạn chuyển Expired đúng một lần và trả chỗ cho lớp. Chọn batch bằng
/// FOR UPDATE SKIP LOCKED nên nhiều instance an toàn. Việc hủy Invoice và nhả điểm giữ do dịch vụ hết hạn checkout của Payment
/// (chặng checkout) nối vào danh sách hold trả về.
/// </summary>
public sealed class SeatHoldExpiryJob(IServiceProvider services, ILogger<SeatHoldExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(SeatHoldExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var holds = scopedServices.GetRequiredService<SeatHoldService>();
        var expired = await holds.ExpireDueAsync(ct: ct);

        if (expired.Count > 0)
        {
            logger.LogInformation("SeatHoldExpiryJob: hết hạn {Count} giữ chỗ.", expired.Count);
        }
    }
}

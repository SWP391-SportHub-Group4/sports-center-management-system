using SportHub.Scheduling.Threshold.Application;

namespace SportHub.API.Jobs;

public sealed class ClassThresholdResponseExpiryJob(IServiceProvider services,
    ILogger<ClassThresholdResponseExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(ClassThresholdResponseExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var count = await scopedServices.GetRequiredService<ThresholdResponseExpiryService>().ExpireAsync(ct);
        if (count > 0) logger.LogInformation("ClassThresholdResponseExpiryJob processed {Count} class responses/cancellations.", count);
    }
}

using SportHub.Identity.Application.Services;

namespace SportHub.API.Jobs;

public sealed class SupportSlaReminderJob(IServiceProvider services,
    ILogger<SupportSlaReminderJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(15))
{
    protected override string JobName => nameof(SupportSlaReminderJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => await scopedServices.GetRequiredService<SupportReminderService>().SendDueSlaAsync(ct);
}

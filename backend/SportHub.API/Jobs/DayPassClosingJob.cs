using SportHub.Payment.Application.Services;

namespace SportHub.API.Jobs;

/// <summary>Closes day-pass orders without the general checkout reconciliation/grace delay.</summary>
public sealed class DayPassClosingJob(IServiceProvider services, ILogger<DayPassClosingJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromSeconds(1))
{
    protected override string JobName => nameof(DayPassClosingJob);
    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => await scopedServices.GetRequiredService<DayPassHoursService>().CloseDueAsync(ct);
}

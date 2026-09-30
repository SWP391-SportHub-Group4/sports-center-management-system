using SportHub.Payment.Application.Services;

namespace SportHub.API.Jobs;

public sealed class CheckoutExpiryJob(IServiceProvider services, ILogger<CheckoutExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(CheckoutExpiryJob);
    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => await scopedServices.GetRequiredService<CheckoutExpiryService>().ExpireDueAsync(ct);
}

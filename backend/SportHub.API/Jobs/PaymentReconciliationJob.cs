using SportHub.Payment.Application.Services;

namespace SportHub.API.Jobs;

public sealed class PaymentReconciliationJob(IServiceProvider services, ILogger<PaymentReconciliationJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(PaymentReconciliationJob);
    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
        => await scopedServices.GetRequiredService<PaymentReconciliationService>().RetryPendingAsync(ct);
}

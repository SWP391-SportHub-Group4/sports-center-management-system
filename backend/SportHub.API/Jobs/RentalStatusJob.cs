using SportHub.Scheduling.Rental.Application;

namespace SportHub.API.Jobs;

public sealed class RentalStatusJob(IServiceProvider services, ILogger<RentalStatusJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(RentalStatusJob);
    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var count = await scopedServices.GetRequiredService<CourtRentalService>().CompleteDueAsync(ct);
        if (count > 0) logger.LogInformation("RentalStatusJob completed {Count} court rentals.", count);
    }
}

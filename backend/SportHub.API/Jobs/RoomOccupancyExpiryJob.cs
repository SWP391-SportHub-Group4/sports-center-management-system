using SportHub.Scheduling.Occupancy.Application;

namespace SportHub.API.Jobs;

public sealed class RoomOccupancyExpiryJob(IServiceProvider services, ILogger<RoomOccupancyExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(RoomOccupancyExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var count = await scopedServices.GetRequiredService<RoomOccupancyExpiryService>().ExpireAsync(ct);
        if (count > 0) logger.LogInformation("RoomOccupancyExpiryJob released {Count} elapsed room occupancies.", count);
    }
}

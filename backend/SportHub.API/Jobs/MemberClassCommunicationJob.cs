using SportHub.Scheduling.Application.Services;

namespace SportHub.API.Jobs;

public sealed class MemberClassCommunicationJob(IServiceProvider services, ILogger<MemberClassCommunicationJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(MemberClassCommunicationJob);
    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        await scopedServices.GetRequiredService<ClassSessionReminderService>().RunAsync(ct);
    }
}

using SportHub.Scheduling.Threshold.Application;

namespace SportHub.API.Jobs;

public sealed class ClassThresholdEvaluationJob(IServiceProvider services, ILogger<ClassThresholdEvaluationJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(5))
{
    protected override string JobName => nameof(ClassThresholdEvaluationJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var count = await scopedServices.GetRequiredService<IClassThresholdService>().EvaluateDueAsync(ct);
        if (count > 0) logger.LogInformation("ClassThresholdEvaluationJob evaluated {Count} classes.", count);
    }
}

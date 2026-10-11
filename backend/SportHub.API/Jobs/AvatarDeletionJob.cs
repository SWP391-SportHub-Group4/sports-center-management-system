using SportHub.Identity.Application.Services;

namespace SportHub.API.Jobs;

public sealed class AvatarDeletionJob(IServiceScopeFactory scopes, ILogger<AvatarDeletionJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<AvatarService>()
                    .ProcessPendingDeletionsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Avatar deletion retry failed");
            }
        }
    }
}

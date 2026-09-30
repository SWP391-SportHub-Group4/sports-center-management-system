using SportHub.Payment.Wallet.Application;

namespace SportHub.API.Jobs;

public sealed class PointHoldExpiryJob(IServiceScopeFactory scopes, ILogger<PointHoldExpiryJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var released = await scope.ServiceProvider.GetRequiredService<PointConfirmationService>()
                    .ReleaseExpiredAsync(stoppingToken);
                if (released > 0) logger.LogInformation("Released points for {Count} expired checkouts", released);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError(ex, "Point hold expiry failed; will retry"); }
        }
    }
}

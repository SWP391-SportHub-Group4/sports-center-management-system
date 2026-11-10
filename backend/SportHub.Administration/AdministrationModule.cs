using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SportHub.Administration.Application.Services;
using SportHub.BuildingBlocks.Abstractions.Media;

namespace SportHub.Administration;

public static class AdministrationModule
{
    public static IServiceCollection AddServiceImageAdministration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ServiceImageService>();
        services.AddScoped<IMediaImageReferenceGuard, MediaImageReferenceGuard>();
        services.AddScoped<ServiceImageCleanupService>();
        if (!configuration.GetValue<bool>("SharedDatabase:Enabled"))
            services.AddHostedService<ServiceImageCleanupJob>();
        return services;
    }
}

internal sealed class ServiceImageCleanupJob(IServiceScopeFactory scopes, ILogger<ServiceImageCleanupJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<ServiceImageCleanupService>().ProcessAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Service image cleanup will retry: {FailureType}", ex.GetType().Name);
            }
        }
    }
}

using Microsoft.EntityFrameworkCore;
using SportHub.API.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Training.Application.Services;
using SportHub.Training.Domain.Enums;

namespace SportHub.API.Jobs;

/// <summary>Only PT is finalized automatically. Group attendance remains a receptionist decision.</summary>
public sealed class AttendanceFinalizerJob(IServiceProvider services, ILogger<AttendanceFinalizerJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(10))
{
    protected override string JobName => nameof(AttendanceFinalizerJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var db = scopedServices.GetRequiredService<SportHubDbContext>();
        var now = scopedServices.GetRequiredService<IClock>().UtcNow;
        var ids = await db.PtSessions.AsNoTracking()
            .Where(s => s.Status == PtSessionStatus.Scheduled && s.EndAtUtc <= now)
            .OrderBy(s => s.EndAtUtc).Select(s => s.SessionId).Take(200).ToListAsync(ct);
        foreach (var id in ids)
        {
            // Each transition owns its transaction/tracker so a concurrent coach edit cannot poison the next item.
            await using var scope = scopedServices.GetRequiredService<IServiceScopeFactory>().CreateAsyncScope();
            try
            {
                await scope.ServiceProvider.GetRequiredService<PtSessionService>().FinalizeNoShowAsync(id, ct);
            }
            catch (ConflictException ex)
            {
                logger.LogInformation("PT finalization deferred for {SessionId}: {Code}", id, ex.ErrorCode);
            }
        }
    }
}

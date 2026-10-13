using SportHub.Administration.Application.Services;

namespace SportHub.API.Jobs;

public sealed class StaffInvitationExpiryJob(IServiceProvider services, ILogger<StaffInvitationExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(1))
{
    protected override string JobName => nameof(StaffInvitationExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var candidates = await scopedServices.GetRequiredService<StaffInvitationExpiryService>().FindCandidatesAsync(ct);
        foreach (var userId in candidates)
        {
            // One scope/transaction per account: a failed deletion cannot poison subsequent candidates.
            await using var scope = scopedServices.CreateAsyncScope();
            try
            {
                if (await scope.ServiceProvider.GetRequiredService<StaffInvitationExpiryService>().ExpireAsync(userId, ct))
                    logger.LogInformation("Expired unactivated staff account {UserId}; email released.", userId);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Could not expire staff account {UserId}; transaction rolled back, will retry.", userId);
            }
        }
    }
}

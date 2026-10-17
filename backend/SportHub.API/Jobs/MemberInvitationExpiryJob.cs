using SportHub.Administration.Application.Services;

namespace SportHub.API.Jobs;

/// <summary>Removes front-desk members who never activated their account within a week (see <see cref="MemberInvitationExpiryService"/>).</summary>
public sealed class MemberInvitationExpiryJob(IServiceProvider services, ILogger<MemberInvitationExpiryJob> logger)
    : PeriodicJob(services, logger, TimeSpan.FromMinutes(10))
{
    protected override string JobName => nameof(MemberInvitationExpiryJob);

    protected override async Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct)
    {
        var candidates = await scopedServices.GetRequiredService<MemberInvitationExpiryService>().FindCandidatesAsync(ct);
        foreach (var userId in candidates)
        {
            // One scope/transaction per account: a failed deletion cannot poison the rest.
            await using var scope = scopedServices.CreateAsyncScope();
            try
            {
                if (await scope.ServiceProvider.GetRequiredService<MemberInvitationExpiryService>().ExpireAsync(userId, ct))
                    logger.LogInformation("Removed member {UserId} who never activated; email released.", userId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not remove pending member {UserId}; it will be retried.", userId);
            }
        }
    }
}

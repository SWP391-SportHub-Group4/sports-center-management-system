namespace SportHub.BuildingBlocks.Abstractions.Identity;

/// <summary>Recognizes Admin-created staff invitations without a dependency on the Audit module.</summary>
public interface IStaffInvitationExpiryReader
{
    Task<bool> IsExpiredAsync(Guid userId, DateTime createdAtUtc, DateTime nowUtc,
        CancellationToken ct = default);
}

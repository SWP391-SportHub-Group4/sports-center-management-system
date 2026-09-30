namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>Reads and ends the Membership entitlement associated with a paid invoice item.</summary>
public interface IMembershipRefundFulfillment
{
    Task<MembershipRefundFacts?> GetFactsAsync(Guid invoiceItemId, Guid? relatedMemberPackageId,
        CancellationToken cancellationToken = default);
    Task CancelAsync(Guid invoiceItemId, Guid? relatedMemberPackageId, string reason, Guid actorUserId,
        CancellationToken cancellationToken = default);
}

public sealed record MembershipRefundFacts(
    Guid MemberId,
    DateOnly StartDate,
    DateOnly EndDate,
    bool IsActive);

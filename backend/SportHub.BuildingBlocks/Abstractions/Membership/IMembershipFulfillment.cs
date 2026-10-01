namespace SportHub.BuildingBlocks.Abstractions.Membership;

/// <summary>Membership owns entitlement mutations; all writes join the caller transaction.</summary>
public interface IMembershipFulfillment
{
    Task<MembershipPurchaseQuote> QuoteAsync(int packageId, CancellationToken ct = default);
    Task<MembershipPurchaseState> GetAsync(Guid memberPackageId, CancellationToken ct = default);
    Task<Guid> PrepareAsync(Guid memberId, int packageId, Guid actorId, bool allowStacking,
        string? stackingReason, CancellationToken ct = default);
    Task AttachItemAsync(Guid memberPackageId, Guid itemId, CancellationToken ct = default);
    Task ActivateAsync(Guid memberPackageId, Guid invoiceId, Guid actorId, CancellationToken ct = default);
    Task ReleaseAsync(Guid memberPackageId, CancellationToken ct = default);
}

public sealed record MembershipPurchaseQuote(int PackageId, string Name, decimal Price, int DurationDays, int? SessionLimit);
public sealed record MembershipPurchaseState(int PackageId, Guid? StackingApprovedByUserId, string? StackingApprovalReason);

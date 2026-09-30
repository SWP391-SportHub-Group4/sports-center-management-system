namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>System lifecycle operations on a pending checkout. Joins the caller's transaction.</summary>
public interface ICheckoutLifecycleService
{
    Task ReleaseForSystemAsync(Guid invoiceId, string reason, CancellationToken cancellationToken = default);
    Task<PendingCheckoutState> GetStateAsync(Guid invoiceId, CancellationToken cancellationToken = default);
}

public sealed record PendingCheckoutState(string InvoiceStatus, string SessionState, DateTime ExpiresAtUtc);

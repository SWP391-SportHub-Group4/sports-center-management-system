namespace SportHub.BuildingBlocks.Abstractions.Payment;

/// <summary>Checks that an invoice can back a PAYMENT support request for a member.</summary>
public interface ISupportInvoiceGuard
{
    /// <summary>Throws 400 payment_request_invoice_required, 409 reconciliation_already_resolved or 409 payment_request_already_open.</summary>
    Task EnsureEligibleAsync(Guid memberId, Guid invoiceId, CancellationToken ct);
}

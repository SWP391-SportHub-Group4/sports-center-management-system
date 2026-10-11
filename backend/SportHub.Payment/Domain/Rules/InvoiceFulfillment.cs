namespace SportHub.Payment.Domain.Rules;

/// <summary>Distinguishes purchased benefits from cash compensated after a checkout expired.</summary>
public static class InvoiceFulfillment
{
    public static bool HasBenefits(InvoiceStatus status, string? paidVia)
        => status == InvoiceStatus.Paid
            || (status == InvoiceStatus.PaidAfterReconciliation && paidVia == "VnPayAfterReconciliation");

    public static string Outcome(InvoiceStatus status, string? paidVia, bool reconciliationRequired)
        => HasBenefits(status, paidVia) ? "Fulfilled"
            : reconciliationRequired ? "ReconciliationRequired"
            : status == InvoiceStatus.PaidAfterReconciliation && paidVia == "VnPayCompensated" ? "Compensated"
            : "Pending";
}

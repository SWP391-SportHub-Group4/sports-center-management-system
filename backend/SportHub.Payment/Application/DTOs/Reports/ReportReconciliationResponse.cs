namespace SportHub.Payment.Application.DTOs;

/// <param name="Ok">Every figure matches its independent aggregate and no invoice disagrees with its payments.</param>
/// <param name="PaidInvoicesChecked">Paid invoices with a successful payment in the period.</param>
/// <param name="InvoiceMismatchCount">All disagreeing invoices; <paramref name="InvoiceMismatches"/> is a capped sample.</param>
public sealed record ReportReconciliationResponse(
    DateOnly FromDate,
    DateOnly ToDate,
    DateTime GeneratedAtUtc,
    bool Ok,
    long DurationMs,
    IReadOnlyList<ReconciliationCheck> Checks,
    int PaidInvoicesChecked,
    int InvoiceMismatchCount,
    IReadOnlyList<InvoiceMismatch> InvoiceMismatches);

/// <param name="Reported">What the revenue report says.</param>
/// <param name="Actual">The same figure recomputed straight from the source tables.</param>
public sealed record ReconciliationCheck(string Name, decimal Reported, decimal Actual, decimal Delta, bool Ok);

/// <summary>An invoice whose recorded cash/points do not add up to its total, or whose cash differs from its payments.</summary>
public sealed record InvoiceMismatch(Guid InvoiceId, string InvoiceNumber, decimal TotalAmount, decimal CashAmount,
    int PointsApplied, decimal PaymentsTotal);

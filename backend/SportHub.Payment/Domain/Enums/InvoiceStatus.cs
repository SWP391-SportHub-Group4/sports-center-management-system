namespace SportHub.Payment.Domain.Enums;

public enum InvoiceStatus
{
    Issued = 0,
    Paid = 2,
    Void = 3,
    PaidAfterReconciliation = 4
}

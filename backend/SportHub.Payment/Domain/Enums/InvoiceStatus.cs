namespace SportHub.Payment.Domain.Enums;

// Vòng đời hóa đơn.
public enum InvoiceStatus
{
    Issued,
    PartiallyPaid,
    Paid,
    Void
}

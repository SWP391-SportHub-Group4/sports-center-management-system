namespace SportHub.Repository.Enums.Payment;

// Vòng đời hóa đơn.
public enum InvoiceStatus
{
    Issued,
    PartiallyPaid,
    Paid,
    Void
}

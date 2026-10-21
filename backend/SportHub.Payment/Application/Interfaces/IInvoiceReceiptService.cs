namespace SportHub.Payment.Application.Interfaces;

public interface IInvoiceReceiptService
{
    Task<InvoiceReceiptModel> BuildAsync(
        Guid invoiceId,
        CancellationToken ct = default);

    byte[] RenderPdf(
        InvoiceReceiptModel model);

    string RenderHtml(
        InvoiceReceiptModel model);
}

public sealed record InvoiceReceiptItem(
    string Description,
    decimal UnitPrice,
    int Quantity,
    decimal LineAmount);

public sealed record InvoiceReceiptModel(
    Guid InvoiceId,
    string InvoiceNumber,
    DateTime IssuedAt,
    DateTime? PaidAtUtc,

    string CashierName,

    string MemberName,
    string MemberEmail,
    string? MemberPhone,

    IReadOnlyList<InvoiceReceiptItem> Items,

    decimal TotalAmount,
    int PointsApplied,
    decimal PointsValue,
    decimal CashAmount,

    string PaymentMethod,
    string PaymentStatus,

    int RefundedPoints,
    string? TransactionReference = null,
    string? CenterPhone = null,
    string? CenterEmail = null,
    string? CenterAddress = null,
    decimal Outstanding = 0m,
    bool ShowCashier = false);
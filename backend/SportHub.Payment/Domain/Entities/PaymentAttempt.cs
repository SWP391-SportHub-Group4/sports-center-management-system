using SportHub.Payment.Domain.Enums;

namespace SportHub.Payment.Domain.Entities;

public class PaymentAttempt
{
    public Guid PaymentAttemptId { get; set; }

    public Guid InvoiceId { get; set; }
    public Guid? CheckoutSessionId { get; set; }

    public Invoice? Invoice { get; set; }

    public string VnpTxnRef { get; set; } = string.Empty;

    public decimal Amount { get; set; }
    public int PointsSnapshot { get; set; }
    public decimal CashSnapshot { get; set; }
    public string? ProviderTransactionId { get; set; }
    public string? VerifiedResult { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }

    public DateTime VnpExpireDate { get; set; }

    public PaymentAttemptStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }
}

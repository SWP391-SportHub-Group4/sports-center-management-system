namespace SportHub.Payment.Domain.Entities;

public sealed class VerifiedGatewayEvent
{
    public Guid VerifiedGatewayEventId { get; set; }
    public Guid PaymentAttemptId { get; set; }
    public string Provider { get; set; } = "VNPay";
    public string ProviderTransactionId { get; set; } = string.Empty;
    public string TransactionReference { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string ResponseCode { get; set; } = string.Empty;
    public string TransactionStatus { get; set; } = string.Empty;
    public DateTime ProviderPaidAtUtc { get; set; }
    public DateTime VerifiedAtUtc { get; set; }
    public string ProcessingStatus { get; set; } = "Pending";
    public int RetryCount { get; set; }
    public string? LastError { get; set; }
    public DateTime? ProcessedAtUtc { get; set; }
}

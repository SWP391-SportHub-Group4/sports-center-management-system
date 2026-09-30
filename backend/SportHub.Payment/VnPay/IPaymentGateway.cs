namespace SportHub.Payment.VnPay;

public interface IPaymentGateway
{
    string CreatePaymentUrl(string transactionReference, decimal amountVnd, DateTime createdAtUtc,
        DateTime expiresAtUtc, string clientIp);
    VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values);
    Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct);
}

public sealed record VerifiedPaymentResult(string TransactionReference, string ProviderTransactionId,
    decimal AmountVnd, bool IsSuccessful, string ResponseCode, string TransactionStatus, DateTime ProviderPaidAtUtc);

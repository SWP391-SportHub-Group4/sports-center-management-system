namespace SportHub.Payment.VnPay;

public interface IPaymentGateway
{
    string Mode => "VNPAY";
    string CreatePaymentUrl(string transactionReference, decimal amountVnd, DateTime createdAtUtc,
        DateTime expiresAtUtc, string clientIp);
    VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values);
    Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct);
    /// <summary>Returns the transaction reference when the signed return parameters say the payer
    /// cancelled on the gateway (vnp_ResponseCode 24); null for any other signed outcome.
    /// Throws when the signature or merchant code is invalid.</summary>
    string? VerifyCancellation(IReadOnlyDictionary<string, string> values) => null;
}

public sealed record VerifiedPaymentResult(string TransactionReference, string ProviderTransactionId,
    decimal AmountVnd, bool IsSuccessful, string ResponseCode, string TransactionStatus, DateTime ProviderPaidAtUtc);

using System.Globalization;
using System.Security.Cryptography;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Payment.VnPay;

/// <summary>Development-only signer; simulated callbacks still pass the verified-event pipeline.</summary>
public sealed class MockPaymentGateway : IPaymentGateway
{
    public Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct)
        => Task.FromResult<VerifiedPaymentResult?>(null);
    private readonly string _secret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    public string CreatePaymentUrl(string transactionReference, decimal amountVnd, DateTime createdAtUtc,
        DateTime expiresAtUtc, string clientIp)
        => "/api/dev/payments/" + Uri.EscapeDataString(transactionReference);

    public VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values)
    {
        if (!VnPaySigner.Verify(values, _secret)
            || !values.TryGetValue("vnp_TmnCode", out var merchant) || merchant != "DEV-MOCK"
            || !values.TryGetValue("vnp_Amount", out var minorText)
            || !long.TryParse(minorText, NumberStyles.None, CultureInfo.InvariantCulture, out var minor)
            || minor <= 0 || minor % 100 != 0)
            throw new BadRequestException("mock_payment_invalid", "Giao dịch thử không hợp lệ.");
        var local = DateTime.ParseExact(values["vnp_PayDate"], "yyyyMMddHHmmss",
            CultureInfo.InvariantCulture);
        var vn = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
        return new VerifiedPaymentResult(values["vnp_TxnRef"], values["vnp_TransactionNo"],
            minor / 100m, values["vnp_ResponseCode"] == "00" && values["vnp_TransactionStatus"] == "00",
            values["vnp_ResponseCode"], values["vnp_TransactionStatus"],
            TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), vn));
    }

    public IReadOnlyDictionary<string, string> BuildCallback(string reference, decimal amountVnd, bool success)
    {
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"));
        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_TmnCode"] = "DEV-MOCK", ["vnp_TxnRef"] = reference,
            ["vnp_TransactionNo"] = RandomNumberGenerator.GetInt32(1, int.MaxValue)
                .ToString(CultureInfo.InvariantCulture),
            ["vnp_Amount"] = (amountVnd * 100).ToString("0", CultureInfo.InvariantCulture),
            ["vnp_ResponseCode"] = success ? "00" : "24",
            ["vnp_TransactionStatus"] = success ? "00" : "02",
            ["vnp_PayDate"] = now.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture)
        };
        fields["vnp_SecureHash"] = VnPaySigner.Sign(VnPaySigner.Canonicalize(fields), _secret);
        return fields;
    }
}

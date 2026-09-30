using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.SharedKernel.Errors;

namespace SportHub.Payment.VnPay;

public sealed class VnPayGateway(IOptions<VnPayOptions> options, HttpClient http) : IPaymentGateway
{
    private static readonly TimeZoneInfo Vietnam = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
    private readonly VnPayOptions _options = options.Value;

    public string CreatePaymentUrl(string transactionReference, decimal amountVnd, DateTime createdAtUtc,
        DateTime expiresAtUtc, string clientIp)
    {
        RequireConfigured();
        if (amountVnd <= 0 || decimal.Truncate(amountVnd) != amountVnd)
            throw new BadRequestException("vnp_amount_invalid", "Số tiền VNPay phải là VND nguyên dương.");
        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_Version"] = "2.1.0", ["vnp_Command"] = "pay", ["vnp_TmnCode"] = _options.TmnCode,
            ["vnp_Amount"] = checked(amountVnd * 100).ToString("0", CultureInfo.InvariantCulture),
            ["vnp_CreateDate"] = LocalDate(createdAtUtc), ["vnp_ExpireDate"] = LocalDate(expiresAtUtc),
            ["vnp_CurrCode"] = "VND", ["vnp_IpAddr"] = clientIp,
            ["vnp_Locale"] = "vn", ["vnp_OrderInfo"] = "Thanh toan SportHub " + transactionReference,
            ["vnp_OrderType"] = "other", ["vnp_ReturnUrl"] = _options.ReturnUrl,
            ["vnp_TxnRef"] = transactionReference
        };
        var canonical = VnPaySigner.Canonicalize(fields);
        return _options.PaymentUrl + "?" + canonical + "&vnp_SecureHash=" + VnPaySigner.Sign(canonical, _options.HashSecret);
    }

    public VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values)
    {
        RequireConfigured();
        if (!VnPaySigner.Verify(values, _options.HashSecret) || Get(values, "vnp_TmnCode") != _options.TmnCode)
            throw new BadRequestException("vnp_invalid_signature", "Chữ ký hoặc mã merchant VNPay không hợp lệ.");
        if (!long.TryParse(Get(values, "vnp_Amount"), NumberStyles.None, CultureInfo.InvariantCulture, out var minor)
            || minor <= 0 || minor % 100 != 0)
            throw new BadRequestException("vnp_invalid_amount", "Số tiền VNPay không hợp lệ.");
        var reference = Get(values, "vnp_TxnRef");
        var transactionId = Get(values, "vnp_TransactionNo");
        var response = Get(values, "vnp_ResponseCode");
        var status = Get(values, "vnp_TransactionStatus");
        var payDate = Get(values, "vnp_PayDate");
        if (string.IsNullOrWhiteSpace(reference) || string.IsNullOrWhiteSpace(transactionId)
            || response.Length != 2 || status.Length != 2
            || !DateTime.TryParseExact(payDate, "yyyyMMddHHmmss", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var local))
            throw new BadRequestException("vnp_invalid_payload", "Dữ liệu giao dịch VNPay thiếu hoặc sai định dạng.");
        var paidAtUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), Vietnam);
        return new VerifiedPaymentResult(reference, transactionId, minor / 100m,
            response == "00" && status == "00", response, status, paidAtUtc);
    }

    public async Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct)
    {
        RequireConfigured();
        var now = DateTime.UtcNow;
        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_RequestId"] = Guid.NewGuid().ToString("N"),
            ["vnp_Version"] = "2.1.0", ["vnp_Command"] = "querydr",
            ["vnp_TmnCode"] = _options.TmnCode, ["vnp_TxnRef"] = attempt.VnpTxnRef,
            ["vnp_TransactionDate"] = LocalDate(attempt.CreatedAt),
            ["vnp_CreateDate"] = LocalDate(now), ["vnp_IpAddr"] = "127.0.0.1",
            ["vnp_OrderInfo"] = "Tra cuu SportHub " + attempt.VnpTxnRef
        };
        var requestOrder = new[] { "vnp_RequestId", "vnp_Version", "vnp_Command", "vnp_TmnCode",
            "vnp_TxnRef", "vnp_TransactionDate", "vnp_CreateDate", "vnp_IpAddr", "vnp_OrderInfo" };
        fields["vnp_SecureHash"] = VnPaySigner.Sign(
            string.Join('|', requestOrder.Select(x => fields[x])), _options.HashSecret);
        using var response = await http.PostAsJsonAsync(_options.QueryUrl, fields, ct);
        response.EnsureSuccessStatusCode();
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct),
            cancellationToken: ct);
        var values = json.RootElement.EnumerateObject().ToDictionary(x => x.Name,
            x => x.Value.ToString(), StringComparer.Ordinal);
        var responseOrder = new[] { "vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message",
            "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_BankCode", "vnp_PayDate",
            "vnp_TransactionNo", "vnp_TransactionType", "vnp_TransactionStatus",
            "vnp_OrderInfo", "vnp_PromotionCode", "vnp_PromotionAmount" };
        var checksum = Get(values, "vnp_SecureHash");
        var expected = VnPaySigner.Sign(string.Join('|', responseOrder.Select(x => Get(values, x))),
            _options.HashSecret);
        if (checksum.Length != 128 || !checksum.All(Uri.IsHexDigit)
            || !CryptographicOperations.FixedTimeEquals(Convert.FromHexString(checksum),
                Convert.FromHexString(expected))
            || Get(values, "vnp_TmnCode") != _options.TmnCode
            || Get(values, "vnp_TxnRef") != attempt.VnpTxnRef)
            throw new BadRequestException("vnp_query_invalid", "Phản hồi QueryDR không được xác minh.");
        if (Get(values, "vnp_ResponseCode") != "00" || Get(values, "vnp_TransactionType") != "01") return null;
        if (!long.TryParse(Get(values, "vnp_Amount"), NumberStyles.None,
                CultureInfo.InvariantCulture, out var minor)
            || minor <= 0 || minor % 100 != 0)
            throw new BadRequestException("vnp_query_invalid_amount", "Số tiền QueryDR không hợp lệ.");
        var transactionId = Get(values, "vnp_TransactionNo");
        var date = Get(values, "vnp_PayDate");
        if (string.IsNullOrWhiteSpace(transactionId)
            || !DateTime.TryParseExact(date, "yyyyMMddHHmmss", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var local)) return null;
        var paidAtUtc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), Vietnam);
        var status = Get(values, "vnp_TransactionStatus");
        return new VerifiedPaymentResult(attempt.VnpTxnRef, transactionId, minor / 100m,
            status == "00", "00", status, paidAtUtc);
    }

    private void RequireConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.TmnCode) || string.IsNullOrWhiteSpace(_options.HashSecret)
            || string.IsNullOrWhiteSpace(_options.ReturnUrl))
            throw new InvalidOperationException("VNPay merchant credentials and return URL must be configured.");
    }

    private static string Get(IReadOnlyDictionary<string, string> fields, string key)
        => fields.TryGetValue(key, out var value) ? value : string.Empty;
    private static string LocalDate(DateTime utc)
        => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), Vietnam)
            .ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
}

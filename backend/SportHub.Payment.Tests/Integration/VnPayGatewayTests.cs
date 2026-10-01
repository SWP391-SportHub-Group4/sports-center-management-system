using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Tests.Integration;

public sealed class VnPayGatewayTests
{
    [Fact]
    public void Pay_v21_canonicalization_matches_official_form_encoding_and_hmac_fixture()
    {
        var fields = new Dictionary<string, string>
        {
            ["vnp_Version"] = "2.1.0", ["vnp_TxnRef"] = "5",
            ["vnp_TmnCode"] = "DEMOV210", ["vnp_OrderInfo"] = "Thanh toan don hang :5",
            ["vnp_Command"] = "pay", ["vnp_Amount"] = "1806000"
        };
        var canonical = VnPaySigner.Canonicalize(fields);
        Assert.Equal("vnp_Amount=1806000&vnp_Command=pay&vnp_OrderInfo=Thanh+toan+don+hang+%3A5"
            + "&vnp_TmnCode=DEMOV210&vnp_TxnRef=5&vnp_Version=2.1.0", canonical);
        Assert.Equal("ce94cf3f5dbc037db88a82d1d20f3a62119a07d68ffacc4517a50fa503e9fa27d138fcaf7a0f12e136dc0c206f06643dd3185cf05f9bc1e3326c8cac42f447f1",
            VnPaySigner.Sign(canonical, "test-secret"));
        fields["vnp_SecureHash"] = VnPaySigner.Sign(canonical, "test-secret");
        Assert.True(VnPaySigner.Verify(fields, "test-secret"));
        fields["vnp_Amount"] = "1806001";
        Assert.False(VnPaySigner.Verify(fields, "test-secret"));
    }

    [Fact]
    public void Payment_url_uses_minor_units_and_callback_checks_merchant_amount_and_time()
    {
        var gateway = NewGateway(new HttpClient(new NoNetworkHandler()));
        var created = new DateTime(2026, 9, 30, 1, 0, 0, DateTimeKind.Utc);
        var url = gateway.CreatePaymentUrl("attempt-1", 18_060m, created,
            created.AddMinutes(15), "127.0.0.1");
        Assert.Contains("vnp_Amount=1806000", url);
        Assert.Contains("vnp_CreateDate=20260930080000", url);
        Assert.Contains("vnp_ExpireDate=20260930081500", url);
        var fields = new Dictionary<string, string>
        {
            ["vnp_TmnCode"] = "DEMOV210", ["vnp_TxnRef"] = "attempt-1",
            ["vnp_TransactionNo"] = "123456", ["vnp_Amount"] = "1806000",
            ["vnp_ResponseCode"] = "00", ["vnp_TransactionStatus"] = "00",
            ["vnp_PayDate"] = "20260930080200"
        };
        fields["vnp_SecureHash"] = VnPaySigner.Sign(VnPaySigner.Canonicalize(fields), "test-secret");
        var verified = gateway.VerifyCallback(fields);
        Assert.Equal(18_060m, verified.AmountVnd);
        Assert.Equal(new DateTime(2026, 9, 30, 1, 2, 0, DateTimeKind.Utc), verified.ProviderPaidAtUtc);
        Assert.True(verified.IsSuccessful);
        fields["vnp_TmnCode"] = "WRONG";
        Assert.Throws<BadRequestException>(() => gateway.VerifyCallback(fields));
    }

    private static VnPayGateway NewGateway(HttpClient client)
        => new(Options.Create(new VnPayOptions
        {
            TmnCode = "DEMOV210", HashSecret = "test-secret", ReturnUrl = "https://merchant.example/return"
        }), client);

    [Theory]
    [InlineData("valid")]
    [InlineData("tampered")]
    [InlineData("wrong-merchant")]
    [InlineData("wrong-reference")]
    [InlineData("wrong-command")]
    [InlineData("query-failed")]
    [InlineData("payment-failed")]
    [InlineData("refund")]
    public async Task QueryDR_uses_official_pipe_order_and_only_accepts_verified_payment_response(string scenario)
    {
        // Field order from VNPay QueryDR 2.1.0 documentation; deliberately independent of URL canonicalization.
        var fields = new Dictionary<string, string>
        {
            ["vnp_ResponseId"] = "response-1", ["vnp_Command"] = "querydr", ["vnp_ResponseCode"] = "00",
            ["vnp_Message"] = "Success", ["vnp_TmnCode"] = "DEMOV210", ["vnp_TxnRef"] = "attempt-1",
            ["vnp_Amount"] = "1806000", ["vnp_BankCode"] = "NCB", ["vnp_PayDate"] = "20260930080200",
            ["vnp_TransactionNo"] = "123456", ["vnp_TransactionType"] = "01",
            ["vnp_TransactionStatus"] = "00", ["vnp_OrderInfo"] = "Thanh toan SportHub attempt-1"
        };
        if (scenario == "wrong-merchant") fields["vnp_TmnCode"] = "OTHER";
        if (scenario == "wrong-reference") fields["vnp_TxnRef"] = "another-attempt";
        if (scenario == "wrong-command") fields["vnp_Command"] = "refund";
        if (scenario == "query-failed") fields["vnp_ResponseCode"] = "91";
        if (scenario == "payment-failed") fields["vnp_TransactionStatus"] = "02";
        if (scenario == "refund") fields["vnp_TransactionType"] = "02";
        var payload = $"response-1|{fields["vnp_Command"]}|{fields["vnp_ResponseCode"]}|Success|{fields["vnp_TmnCode"]}"
            + $"|{fields["vnp_TxnRef"]}|1806000|NCB|20260930080200|123456|{fields["vnp_TransactionType"]}"
            + $"|{fields["vnp_TransactionStatus"]}|Thanh toan SportHub attempt-1||";
        fields["vnp_SecureHash"] = Convert.ToHexString(System.Security.Cryptography.HMACSHA512.HashData(
            System.Text.Encoding.UTF8.GetBytes("test-secret"), System.Text.Encoding.UTF8.GetBytes(payload)));
        if (scenario == "tampered") fields["vnp_Amount"] = "9999900";
        var gateway = NewGateway(new HttpClient(new QueryHandler(fields)));
        var attempt = new PaymentAttempt
        {
            VnpTxnRef = "attempt-1", CreatedAt = new DateTime(2026, 9, 30, 1, 0, 0, DateTimeKind.Utc)
        };
        if (scenario is "tampered" or "wrong-merchant" or "wrong-reference" or "wrong-command")
        {
            await Assert.ThrowsAsync<BadRequestException>(() => gateway.QueryAsync(attempt, default));
            return;
        }
        var result = await gateway.QueryAsync(attempt, default);
        if (scenario is "query-failed" or "refund") Assert.Null(result);
        else
        {
            Assert.NotNull(result);
            Assert.Equal(scenario == "valid", result.IsSuccessful);
            Assert.Equal(18_060m, result.AmountVnd);
            Assert.Equal(new DateTime(2026, 9, 30, 1, 2, 0, DateTimeKind.Utc), result.ProviderPaidAtUtc);
        }
    }

    private sealed class QueryHandler(Dictionary<string, string> response) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("application/json", request.Content!.Headers.ContentType!.MediaType);
            var fields = (await request.Content.ReadFromJsonAsync<Dictionary<string, string>>(cancellationToken))!;
            Assert.Equal("20260930080000", fields["vnp_TransactionDate"]);
            var payload = $"{fields["vnp_RequestId"]}|2.1.0|querydr|DEMOV210|attempt-1|20260930080000"
                + $"|{fields["vnp_CreateDate"]}|127.0.0.1|Tra cuu SportHub attempt-1";
            var expected = Convert.ToHexString(System.Security.Cryptography.HMACSHA512.HashData(
                System.Text.Encoding.UTF8.GetBytes("test-secret"), System.Text.Encoding.UTF8.GetBytes(payload)));
            Assert.Equal(expected, fields["vnp_SecureHash"], ignoreCase: true);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(response) };
        }
    }

    private sealed class NoNetworkHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => throw new InvalidOperationException("No network expected");
    }
}

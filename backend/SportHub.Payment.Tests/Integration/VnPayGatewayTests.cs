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

    private sealed class NoNetworkHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => throw new InvalidOperationException("No network expected");
    }
}

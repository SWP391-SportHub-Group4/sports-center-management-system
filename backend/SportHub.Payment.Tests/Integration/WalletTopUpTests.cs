using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SportHub.Identity.Domain.Enums;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.VnPay;
using SportHub.Payment.Wallet.Domain;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class WalletTopUpTests(PaymentApiFactory factory)
{
    private async Task<(CheckoutResponse Checkout, PaymentAttemptResponse Attempt)> StartAsync(HttpClient client, int points = 25)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/wallet-top-up")
        {
            Content = JsonContent.Create(new { points })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(points * 1000m, checkout.CashAmount);
        var started = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        return (checkout, (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!);
    }

    private async Task ReceiveAsync(PaymentAttemptResponse attempt, bool success = true,
        IReadOnlyDictionary<string, string>? callback = null)
    {
        var gateway = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<PaymentReconciliationService>()
            .ReceiveCallbackAsync(callback ?? gateway.BuildCallback(attempt.TransactionReference, attempt.CashAmount, success), default);
    }

    [Fact]
    public async Task Signed_capture_credits_once_and_cannot_be_paid_with_existing_points()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        var (checkout, attempt) = await StartAsync(client);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/wallet/me/checkouts/{checkout.InvoiceId}/points", new { points = 1 })).StatusCode);
        Assert.Equal(0, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync(x => x.ReferenceId == checkout.InvoiceId)));

        var gateway = Assert.IsType<MockPaymentGateway>(factory.Services.GetRequiredService<IPaymentGateway>());
        var callback = gateway.BuildCallback(attempt.TransactionReference, attempt.CashAmount, success: true);
        await ReceiveAsync(attempt, callback: callback);
        await ReceiveAsync(attempt, callback: callback);
        var state = await client.GetFromJsonAsync<CheckoutResponse>($"/api/checkouts/{checkout.InvoiceId}");
        Assert.Equal("Paid", state!.InvoiceStatus);
        Assert.Equal(25, await factory.QueryAsync(db => db.PointLedgerEntries
            .Where(x => x.ReferenceType == "WalletTopUp" && x.ReferenceId == checkout.InvoiceId)
            .SumAsync(x => x.AvailableDelta)));
        Assert.Equal(1, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync(x =>
            x.ReferenceType == "WalletTopUp" && x.ReferenceId == checkout.InvoiceId)));
        Assert.Equal(1, await factory.QueryAsync(db => db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));
        Assert.Equal(25, await factory.QueryAsync(db => db.PointWallets
            .Where(x => x.OwnerUserId == buyer.UserId).Select(x => x.AvailablePoints).SingleAsync()));
    }

    [Fact]
    public async Task Failed_payment_does_not_credit_and_late_capture_still_credits_original_top_up()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        var (failedCheckout, failedAttempt) = await StartAsync(client, 7);
        await ReceiveAsync(failedAttempt, success: false);
        Assert.Equal(0, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync(x => x.ReferenceId == failedCheckout.InvoiceId)));

        var (lateCheckout, lateAttempt) = await StartAsync(client, 12);
        await factory.QueryAsync(async db =>
        {
            await db.CheckoutSessions.Where(x => x.CheckoutSessionId == lateCheckout.CheckoutSessionId)
                .ExecuteUpdateAsync(x => x.SetProperty(s => s.ExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
            return 0;
        });
        await ReceiveAsync(lateAttempt);
        Assert.Equal(12, await factory.QueryAsync(db => db.PointLedgerEntries
            .Where(x => x.ReferenceType == "WalletTopUp" && x.ReferenceId == lateCheckout.InvoiceId)
            .SumAsync(x => x.AvailableDelta)));
        Assert.Equal(InvoiceStatus.PaidAfterReconciliation, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == lateCheckout.InvoiceId).Select(x => x.Status).SingleAsync()));
    }

    [Fact]
    public async Task Top_up_rejects_invalid_amount_and_other_members_cannot_access_checkout()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        using var stranger = factory.CreateApiClient(other.UserId, UserRole.Member);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/wallet-top-up")
        {
            Content = JsonContent.Create(new { points = 0 })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(request)).StatusCode);
        var (checkout, _) = await StartAsync(client);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await stranger.GetAsync($"/api/checkouts/{checkout.InvoiceId}")).StatusCode);
    }

    [Fact]
    public async Task New_top_up_supersedes_the_unpaid_one_and_late_capture_on_it_still_credits_once()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        using var client = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        var (first, firstAttempt) = await StartAsync(client, 10);
        var (second, _) = await StartAsync(client, 20);

        Assert.Equal(1, await factory.QueryAsync(db => db.Invoices.CountAsync(x =>
            x.MemberId == buyer.UserId && x.Status == InvoiceStatus.Issued)));
        Assert.Equal(InvoiceStatus.Void, await factory.QueryAsync(db => db.Invoices
            .Where(x => x.InvoiceId == first.InvoiceId).Select(x => x.Status).SingleAsync()));

        await ReceiveAsync(firstAttempt);
        Assert.Equal(10, await factory.QueryAsync(db => db.PointLedgerEntries
            .Where(x => x.ReferenceType == "WalletTopUp" && x.ReferenceId == first.InvoiceId)
            .SumAsync(x => x.AvailableDelta)));
        Assert.Equal(0, await factory.QueryAsync(db => db.PointLedgerEntries.CountAsync(x =>
            x.ReferenceType == "WalletTopUp" && x.ReferenceId == second.InvoiceId)));
    }
}

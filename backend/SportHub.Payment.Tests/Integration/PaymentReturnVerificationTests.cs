using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportHub.Identity.Domain.Enums;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Application.DTOs.Checkouts;
using SportHub.Payment.Application.Services;
using SportHub.Payment.Domain.Entities;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.VnPay;

namespace SportHub.Payment.Tests.Integration;

[Collection(nameof(PaymentApiCollection))]
public sealed class PaymentReturnVerificationTests(PaymentApiFactory factory)
{
    [Fact]
    public async Task Development_return_requires_valid_signed_fields_before_confirming_payment()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var packageId = await factory.QueryAsync(async db =>
        {
            var package = new MembershipPackage
            {
                Name = "Signed VNPay return " + Guid.NewGuid().ToString("N"),
                Price = 100_000m, DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync();
            return package.PackageId;
        });
        using var client = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId })
        };
        create.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await client.SendAsync(create);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        var started = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;

        var gateway = (MockPaymentGateway)factory.Services.GetRequiredService<IPaymentGateway>();
        var signed = gateway.BuildCallback(attempt.TransactionReference, attempt.CashAmount, true);
        var tampered = new Dictionary<string, string>(signed) { ["vnp_Amount"] = "20000000" };
        var rejected = await client.PostAsJsonAsync("/api/checkouts/verify-reference",
            new { reference = attempt.TransactionReference, fields = tampered });
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Equal(0, await factory.QueryAsync(db =>
            db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));

        var verified = await client.PostAsJsonAsync("/api/checkouts/verify-reference",
            new { reference = attempt.TransactionReference, fields = signed });
        Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
        Assert.Equal(1, await factory.QueryAsync(db =>
            db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));
        Assert.Equal(PaymentAttemptStatus.Succeeded, await factory.QueryAsync(db =>
            db.PaymentAttempts.Where(x => x.PaymentAttemptId == attempt.PaymentAttemptId)
                .Select(x => x.Status).SingleAsync()));
    }

    [Fact]
    public async Task Incomplete_query_stays_pending_and_later_success_repairs_legacy_failed_event()
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var packageId = await factory.QueryAsync(async db =>
        {
            var package = new MembershipPackage
            {
                Name = "Delayed VNPay " + Guid.NewGuid().ToString("N"),
                Price = 100_000m, DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync();
            return package.PackageId;
        });
        using var ownerClient = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId })
        };
        create.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await ownerClient.SendAsync(create);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        var started = await ownerClient.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;

        var gateway = new ChangingQueryGateway(factory.Services.GetRequiredService<IPaymentGateway>());
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(gateway);
        }));
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = ownerClient.DefaultRequestHeaders.Authorization;

        var incomplete = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/verify-payment", null);
        Assert.Equal(HttpStatusCode.OK, incomplete.StatusCode);
        Assert.Contains("\"verified\":false", await incomplete.Content.ReadAsStringAsync());
        Assert.Equal(PaymentAttemptStatus.Pending, await factory.QueryAsync(db =>
            db.PaymentAttempts.Where(x => x.PaymentAttemptId == attempt.PaymentAttemptId)
                .Select(x => x.Status).SingleAsync()));
        Assert.Equal(0, await factory.QueryAsync(db => db.VerifiedGatewayEvents
            .CountAsync(x => x.PaymentAttemptId == attempt.PaymentAttemptId)));

        // A prior release stored status 01 as a failed event. The same provider ID may later succeed.
        await factory.QueryAsync(async db =>
        {
            var old = await db.PaymentAttempts.SingleAsync(x => x.PaymentAttemptId == attempt.PaymentAttemptId);
            old.Status = PaymentAttemptStatus.Failed;
            old.VerifiedResult = "Failed";
            db.VerifiedGatewayEvents.Add(new VerifiedGatewayEvent
            {
                VerifiedGatewayEventId = Guid.NewGuid(), PaymentAttemptId = old.PaymentAttemptId,
                Provider = "VNPay", ProviderTransactionId = gateway.ProviderTransactionId,
                TransactionReference = old.VnpTxnRef, Amount = old.Amount,
                ResponseCode = "00", TransactionStatus = "01", ProviderPaidAtUtc = DateTime.UtcNow,
                VerifiedAtUtc = DateTime.UtcNow, ProcessingStatus = "Failed"
            });
            await db.SaveChangesAsync();
            return 0;
        });
        gateway.TransactionStatus = "00";
        var completed = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/verify-payment", null);
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        Assert.Contains("\"verified\":true", await completed.Content.ReadAsStringAsync());
        Assert.Equal(1, await factory.QueryAsync(db => db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));
        Assert.Equal(PaymentAttemptStatus.Succeeded, await factory.QueryAsync(db =>
            db.PaymentAttempts.Where(x => x.PaymentAttemptId == attempt.PaymentAttemptId)
                .Select(x => x.Status).SingleAsync()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Buyer_queries_pending_and_expired_attempts_but_other_members_cannot(bool expired)
    {
        var buyer = await factory.SeedUserAsync(UserRole.Member);
        var other = await factory.SeedUserAsync(UserRole.Member);
        var packageId = await factory.QueryAsync(async db =>
        {
            var package = new MembershipPackage
            {
                Name = "Return verification " + Guid.NewGuid().ToString("N"),
                Price = 100_000m, DurationDays = 30, IsActive = true
            };
            db.MembershipPackages.Add(package);
            await db.SaveChangesAsync();
            return package.PackageId;
        });
        using var ownerClient = factory.CreateApiClient(buyer.UserId, UserRole.Member);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/checkouts/membership")
        {
            Content = JsonContent.Create(new { packageId })
        };
        create.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var created = await ownerClient.SendAsync(create);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var checkout = (await created.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        var started = await ownerClient.PostAsync($"/api/checkouts/{checkout.InvoiceId}/attempts", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var attempt = (await started.Content.ReadFromJsonAsync<PaymentAttemptResponse>())!;
        if (expired)
        {
            await factory.QueryAsync(async db =>
            {
                var past = DateTime.UtcNow.AddMinutes(-1);
                await db.Invoices.Where(x => x.InvoiceId == checkout.InvoiceId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.HoldExpiresAtUtc, past));
                await db.CheckoutSessions.Where(x => x.CheckoutSessionId == checkout.CheckoutSessionId)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAtUtc, past));
                return 0;
            });
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<CheckoutExpiryService>().ExpireDueAsync(default);
            Assert.Equal(PaymentAttemptStatus.Expired, await factory.QueryAsync(db =>
                db.PaymentAttempts.Where(x => x.PaymentAttemptId == attempt.PaymentAttemptId)
                    .Select(x => x.Status).SingleAsync()));
        }

        var gateway = new QuerySpy(factory.Services.GetRequiredService<IPaymentGateway>());
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(gateway);
        }));
        using var client = app.CreateClient();
        using var otherClient = factory.CreateApiClient(other.UserId, UserRole.Member);
        client.DefaultRequestHeaders.Authorization = otherClient.DefaultRequestHeaders.Authorization;
        var denied = await client.PostAsJsonAsync("/api/checkouts/verify-reference",
            new { reference = attempt.TransactionReference });
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        Assert.Equal(0, gateway.Calls);

        client.DefaultRequestHeaders.Authorization = ownerClient.DefaultRequestHeaders.Authorization;
        var verified = await client.PostAsJsonAsync("/api/checkouts/verify-reference",
            new { reference = attempt.TransactionReference });
        Assert.Equal(HttpStatusCode.Conflict, verified.StatusCode);
        Assert.Contains("payment_verification_pending", await verified.Content.ReadAsStringAsync());
        Assert.Equal(1, gateway.Calls);
        Assert.Equal(attempt.PaymentAttemptId, gateway.LastAttemptId);
        client.DefaultRequestHeaders.Authorization = otherClient.DefaultRequestHeaders.Authorization;
        var otherInvoiceCheck = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/verify-payment", null);
        Assert.Equal(HttpStatusCode.Forbidden, otherInvoiceCheck.StatusCode);
        Assert.Equal(1, gateway.Calls);

        client.DefaultRequestHeaders.Authorization = ownerClient.DefaultRequestHeaders.Authorization;
        var invoiceCheck = await client.PostAsync($"/api/checkouts/{checkout.InvoiceId}/verify-payment", null);
        Assert.Equal(HttpStatusCode.OK, invoiceCheck.StatusCode);
        Assert.Contains("\"verified\":false", await invoiceCheck.Content.ReadAsStringAsync());
        Assert.Equal(2, gateway.Calls);
        Assert.Equal(attempt.PaymentAttemptId, gateway.LastAttemptId);
        // An absent gateway proof must never create a successful payment.
        Assert.Equal(0, await factory.QueryAsync(db =>
            db.Payments.CountAsync(x => x.InvoiceId == checkout.InvoiceId)));
    }

    private sealed class QuerySpy(IPaymentGateway inner) : IPaymentGateway
    {
        public int Calls { get; private set; }
        public Guid? LastAttemptId { get; private set; }
        public string CreatePaymentUrl(string reference, decimal amount, DateTime created,
            DateTime expires, string ip) => inner.CreatePaymentUrl(reference, amount, created, expires, ip);
        public VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values)
            => inner.VerifyCallback(values);
        public Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct)
        {
            Calls++;
            LastAttemptId = attempt.PaymentAttemptId;
            return Task.FromResult<VerifiedPaymentResult?>(null);
        }
    }

    private sealed class ChangingQueryGateway(IPaymentGateway inner) : IPaymentGateway
    {
        public string ProviderTransactionId { get; } = Guid.NewGuid().ToString("N");
        public string TransactionStatus { get; set; } = "01";
        public string CreatePaymentUrl(string reference, decimal amount, DateTime created,
            DateTime expires, string ip) => inner.CreatePaymentUrl(reference, amount, created, expires, ip);
        public VerifiedPaymentResult VerifyCallback(IReadOnlyDictionary<string, string> values)
            => inner.VerifyCallback(values);
        public Task<VerifiedPaymentResult?> QueryAsync(PaymentAttempt attempt, CancellationToken ct)
            => Task.FromResult<VerifiedPaymentResult?>(new VerifiedPaymentResult(
                attempt.VnpTxnRef, ProviderTransactionId, attempt.Amount,
                TransactionStatus == "00", "00", TransactionStatus, DateTime.UtcNow));
    }
}
